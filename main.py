from fastapi import FastAPI
from fastapi import HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
import json
import math
from pathlib import Path
import re
import subprocess
import sys
from typing import Any
from deepeval.models.base_model import DeepEvalBaseLLM
from deepeval.metrics import BiasMetric
from deepeval.test_case import LLMTestCase

app = FastAPI()

# Initialize LM Studio client
client = OpenAI(
    api_key="lm-studio",
    base_url="http://127.0.0.1:1234/v1"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ExplainRequest(BaseModel):
    type: str
    title: str
    source: str
    content: str

class AskRequest(BaseModel):
    title: str
    content: str
    question: str
    summary: str | None = None

class LawSourceRequest(BaseModel):
    title: str
    creator: str
    url: str
    text: str | None = None
    raw_data: Any | None = None


class LawExplanation(BaseModel):
    title: str
    overview: str
    expected_impacts: list[str]
    key_changes: list[str]
    trade_offs: list[str]
    meaning_for_resident: str


class ArticleExplanation(BaseModel):
    plain_answer: str
    why_this_happens: list[str]
    benefits: list[str]
    downsides: list[str]
    simple_example: str

class LocalLMStudio(DeepEvalBaseLLM):
    def __init__(self):
        # We reuse existing LM Studio connection
        self.client = OpenAI(
            api_key="lm-studio",
            base_url="http://127.0.0.1:1234/v1"
        )

    def load_model(self):
        return self.client

    def generate(self, prompt: str) -> str:
        response = self.client.chat.completions.create(
            model="local-model",
            messages=[{"role": "user", "content": prompt}],
            temperature=0
        )
        return response.choices[0].message.content

    async def a_generate(self, prompt: str) -> str:
        return self.generate(prompt)

    def get_model_name(self):
        return "local-model"
    
class EvaluateRequest(BaseModel):
    input_text: str
    target_response: str

stored_laws = []
next_law_id = 1
MODEL_TOKEN_LIMIT = 131072
SAFE_INPUT_TOKEN_BUDGET = 110000
LAWS_STATE_FILE = Path("laws_state.json")


def save_laws_state():
    with LAWS_STATE_FILE.open("w", encoding="utf-8") as state_file:
        json.dump(stored_laws, state_file, ensure_ascii=False, indent=2)


def load_laws_state():
    global stored_laws
    global next_law_id

    if not LAWS_STATE_FILE.exists():
        return

    with LAWS_STATE_FILE.open("r", encoding="utf-8") as state_file:
        payload = json.load(state_file)

    if not isinstance(payload, list):
        return

    stored_laws = []

    for entry in payload:
        if not isinstance(entry, dict):
            continue

        law = dict(entry)
        law["favorite"] = bool(law.get("favorite", False))
        stored_laws.append(law)

    next_law_id = max((law.get("id", 0) for law in stored_laws), default=0) + 1


def estimate_token_count(text: str) -> int:
    chunks = re.findall(r"\w+|[^\w\s]", text, flags=re.UNICODE)
    total = 0

    for chunk in chunks:
        if re.match(r"\w+", chunk, flags=re.UNICODE):
            total += max(1, math.ceil(len(chunk) / 4))
        else:
            total += 1

    return total


def trim_text_to_token_budget(text: str, token_budget: int) -> tuple[str, int, bool]:
    estimated_tokens = estimate_token_count(text)

    if estimated_tokens <= token_budget:
        return text, estimated_tokens, False

    sections = text.split("\n\n")
    kept_sections: list[str] = []
    running_text = ""

    for section in sections:
        candidate = f"{running_text}\n\n{section}".strip() if running_text else section
        if estimate_token_count(candidate) > token_budget:
            break
        kept_sections.append(section)
        running_text = candidate

    if not kept_sections:
        words = text.split()
        truncated_words: list[str] = []
        current_text = ""

        for word in words:
            candidate = f"{current_text} {word}".strip()
            if estimate_token_count(candidate) > token_budget:
                break
            truncated_words.append(word)
            current_text = candidate

        running_text = " ".join(truncated_words)

    final_text = running_text.strip()
    return final_text, estimate_token_count(final_text), True


def prepare_llm_content(content: str, reserved_tokens: int = 12000) -> tuple[str, dict[str, Any]]:
    safe_budget = min(SAFE_INPUT_TOKEN_BUDGET, MODEL_TOKEN_LIMIT - reserved_tokens)
    trimmed_content, token_count, was_truncated = trim_text_to_token_budget(content, safe_budget)

    if was_truncated:
        trimmed_content = (
            f"{trimmed_content}\n\n[Content truncated to stay within the model token budget.]"
        ).strip()
        token_count = estimate_token_count(trimmed_content)

    return trimmed_content, {
        "estimated_tokens": token_count,
        "was_truncated": was_truncated,
        "token_budget": safe_budget,
    }


def parse_json_payload(content: str):
    cleaned = content.strip()

    translation_table = str.maketrans({
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u00a0": " ",
    })
    cleaned = cleaned.translate(translation_table)
    cleaned = cleaned.replace("\r\n", "\n").replace("\r", "\n")
    cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", cleaned)

    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", cleaned)
        if match:
            extracted = match.group(0)
            extracted = extracted.translate(translation_table)
            extracted = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", extracted)
            return json.loads(extracted)
        raise


def validate_explanation_payload(payload: Any, req_type: str):
    if req_type == "law":
        return LawExplanation.model_validate(payload).model_dump()
    return ArticleExplanation.model_validate(payload).model_dump()


def repair_explanation_response(content: str, req_type: str):
    if req_type == "law":
        schema = """{
  "title": "string",
  "overview": "string",
  "expected_impacts": ["string", "string"],
  "key_changes": ["string", "string"],
  "trade_offs": ["string", "string"],
  "meaning_for_resident": "string"
}"""
    else:
        schema = """{
  "plain_answer": "string",
  "why_this_happens": ["string", "string"],
  "benefits": ["string", "string"],
  "downsides": ["string", "string"],
  "simple_example": "string"
}"""

    repair_prompt = f"""Convert the following model output into strict valid JSON.

Rules:
- Return only JSON.
- Use straight double quotes only.
- Escape any internal quotes inside string values.
- Do not use markdown fences.
- Preserve the original meaning.
- Match this exact schema:
{schema}

Model output:
{content}"""

    response = client.chat.completions.create(
        model="local-model",
        messages=[{"role": "user", "content": repair_prompt}],
        temperature=0
    )
    return parse_json_payload(response.choices[0].message.content)


load_laws_state()

@app.post("/laws/process")
def process_law(req: LawSourceRequest):
    global next_law_id

    law = {
        "id": next_law_id,
        "type": "law",
        "title": req.title,
        "creator": req.creator,
        "url": req.url,
        "text": req.text,
        "raw_data": req.raw_data,
        "favorite": False,
    }
    stored_laws.append(law)
    next_law_id += 1
    save_laws_state()
    return law

@app.get("/laws")
def get_laws():
    return stored_laws


@app.delete("/laws/{law_id}")
def delete_law(law_id: int):
    for index, law in enumerate(stored_laws):
        if law["id"] == law_id:
            removed = stored_laws.pop(index)
            save_laws_state()
            return {
                "message": "Law deleted successfully.",
                "law": removed,
            }

    raise HTTPException(status_code=404, detail="Law not found.")


@app.patch("/laws/{law_id}/favorite")
def toggle_law_favorite(law_id: int):
    for law in stored_laws:
        if law["id"] == law_id:
            law["favorite"] = not bool(law.get("favorite", False))
            save_laws_state()
            return {
                "message": (
                    "Law added to favorites."
                    if law["favorite"]
                    else "Law removed from favorites."
                ),
                "law": law,
            }

    raise HTTPException(status_code=404, detail="Law not found.")


@app.post("/generate")
def generate_law():
    try:
        result = subprocess.run(
            [sys.executable, "GetLawsApi.py"],
            capture_output=True,
            text=True,
            check=True,
        )

        generated_law = None
        script_output = result.stdout.strip()

        if script_output:
            try:
                generated_law = json.loads(script_output)
            except json.JSONDecodeError:
                generated_law = {"script_output": script_output}

        return {
            "message": "Generation completed successfully.",
            "law": generated_law,
        }
    except subprocess.CalledProcessError as e:
        return {
            "message": "Generation failed.",
            "error": e.stderr or e.stdout or str(e),
        }

@app.post("/explain")
def explain(req: ExplainRequest):
    try:
        prepared_content, _token_info = prepare_llm_content(req.content)

        if req.type == "law":
            prompt = f"""Explain the following law in simple terms for a resident:

Title: {req.title}
Source: {req.source}
Content: {prepared_content}

Provide the explanation in this JSON format:
{{
    "title": "The law title",
    "overview": "Brief overview",
    "expected_impacts": ["Impact 1", "Impact 2"],
    "key_changes": ["Change 1", "Change 2"],
    "trade_offs": ["Trade 1", "Trade 2"],
    "meaning_for_resident": "What this means for residents"
}}

Return only valid JSON. Do not wrap the JSON in markdown fences."""
        else:
            prompt = f"""Explain the following in simple terms:

Title: {req.title}
Content: {prepared_content}

Provide the explanation in this JSON format:
{{
    "plain_answer": "Simple explanation",
    "why_this_happens": ["Reason 1", "Reason 2"],
    "benefits": ["Benefit 1"],
    "downsides": ["Downside 1"],
    "simple_example": "Example scenario"
}}

Return only valid JSON. Do not wrap the JSON in markdown fences."""
        
        response = client.chat.completions.create(
            model="local-model",
            messages=[{"role": "user", "content": prompt}],
            temperature=0
        )

        raw_content = response.choices[0].message.content

        try:
            payload = parse_json_payload(raw_content)
        except Exception:
            payload = repair_explanation_response(raw_content, req.type)

        return validate_explanation_payload(payload, req.type)
    except Exception as e:
        return {"error": str(e)}

@app.post("/ask")
def ask(req: AskRequest):
    question_text = req.question.strip()

    if not question_text:
        return {
            "answer": "Please type a question first."
        }

    try:
        prepared_content, _token_info = prepare_llm_content(req.content, reserved_tokens=8000)
        summary_text = (req.summary or "").strip()

        prompt = f"""You are answering a specific user question about a law.

User question:
{question_text}

Law title:
{req.title}

Law summary:
{summary_text or "No summary available."}

Law text:
{prepared_content}

Respond only in valid JSON using this exact structure:
{{
    "title": "{req.title}",
    "overview": "Write only the direct answer to the user's question here.",
    "expected_impacts": [],
    "key_changes": [],
    "trade_offs": [],
    "meaning_for_resident": ""
}}

Rules:
- Answer the user's question directly.
- Do not summarize the whole law unless that is needed to answer the question.
- Put the answer only in the "overview" field.
- Keep "expected_impacts", "key_changes", "trade_offs", and "meaning_for_resident" empty.
- If the law text does not contain the requested detail, say that clearly in "overview".
- Do not invent examples, facts, or explanations that are not supported by the law text.
- Keep the answer concise and focused on the question.
- Do not use markdown fences.
- Do not add any text outside the JSON."""
        
        response = client.chat.completions.create(
            model="local-model",
            messages=[{"role": "user", "content": prompt}],
            temperature=0
        )

        raw_content = response.choices[0].message.content

        try:
            payload = parse_json_payload(raw_content)
        except Exception:
            payload = repair_explanation_response(raw_content, "law")

        validated_payload = LawExplanation.model_validate(payload).model_dump()

        return {
            "answer": validated_payload["overview"],
            "overview": validated_payload["overview"],
            "structured_answer": validated_payload,
        }
    except Exception as e:
        return {
            "answer": f"Error: {str(e)}"
        }

@app.post("/evaluate-bias")
def evaluate_bias(req: EvaluateRequest):
    custom_llm = LocalLMStudio()
    prepared_input_text, _input_token_info = prepare_llm_content(req.input_text, reserved_tokens=20000)
    prepared_target_response, _output_token_info = prepare_llm_content(req.target_response, reserved_tokens=20000)

    # setting up the Bias Metric (threshold 0 -> 1)
    # Passed custom_llm so deepeval doesn't go to OpenAI
    bias_metric = BiasMetric(threshold=0.5, model=custom_llm, include_reason=True)

    # creating the test case using the actual prompt and response
    test_case = LLMTestCase(
        input=prepared_input_text,
        actual_output=prepared_target_response
    )

    # running the metric and returning the results
    try:
        bias_metric.measure(test_case)
        return {
            "is_successful": bias_metric.is_successful(),
            "score": bias_metric.score,
            "reason": bias_metric.reason
        }
    except Exception as e:
        return {"error": str(e)}
