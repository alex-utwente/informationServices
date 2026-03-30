import json
from urllib import request


LAW_PAYLOAD = {
    "title": "Generated law from integration script",
    "creator": "BesluitenAPI integration",
    "url": "https://example.com/generated-law",
    "text": "Generated payload from the integration script.",
    "raw_data": {
        "summary": "This is sample raw API data.",
        "sections": [
            {
                "heading": "Article 1",
                "body": "Replace this with the full response from your source API."
            },
            {
                "heading": "Article 2",
                "body": "The frontend now renders full raw data in a scrollable box."
            }
        ]
    },
}


def send_law():
    body = json.dumps(LAW_PAYLOAD).encode("utf-8")
    req = request.Request(
        "http://localhost:8000/laws/process",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with request.urlopen(req, timeout=30) as response:
        payload = response.read().decode("utf-8")
        return json.loads(payload)


if __name__ == "__main__":
    result = send_law()
    print(json.dumps(result))
