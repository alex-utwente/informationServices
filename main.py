from fastapi import FastAPI
from fastapi import HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
import json
import re
import subprocess
import sys
from typing import Any

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

stored_laws = []
next_law_id = 1


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
    }
    stored_laws.append(law)
    next_law_id += 1
    return law

@app.get("/laws")
def get_laws():
    return stored_laws


@app.delete("/laws/{law_id}")
def delete_law(law_id: int):
    for index, law in enumerate(stored_laws):
        if law["id"] == law_id:
            removed = stored_laws.pop(index)
            return {
                "message": "Law deleted successfully.",
                "law": removed,
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
        if req.type == "law":
            prompt = f"""Explain the following law in simple terms for a resident:

Title: {req.title}
Source: {req.source}
Content: {req.content}

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
Content: {req.content}

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
        prompt = f"""Based on the following document, answer the question:

Title: {req.title}
Content: {req.content}

Question: {question_text}

Provide a clear and concise answer."""
        
        response = client.chat.completions.create(
            model="local-model",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7
        )
        
        return {
            "answer": response.choices[0].message.content
        }
    except Exception as e:
        return {
            "answer": f"Error: {str(e)}"
        }
