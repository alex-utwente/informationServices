import requests
from lxml import etree

url = "https://zoekdienst.overheid.nl/sru/Search"
endpoint = "http://127.0.0.1:8000/laws/process"

params = {
    "operation": "searchRetrieve",
    "version": "1.2",
    "x-connection": "bwb",
    "query": 'modified >= "2026-03-20"',
    "maximumRecords": 1
}

response = requests.get(url, params=params)

parser = etree.XMLParser(recover=True)
root = etree.fromstring(response.content, parser)

ns = {
    "srw": "http://www.loc.gov/zing/srw/",
    "dcterms": "http://purl.org/dc/terms/",
    "bwb": "http://standaarden.overheid.nl/bwb/terms/"
}


def get(record, tag):
    return record.xpath(f".//dcterms:{tag}/text()", namespaces=ns)


for record in root.xpath("//srw:record", namespaces=ns):
    title = get(record, "title")
    title = title[0] if title else None
    identifier = get(record, "identifier")
    identifier = identifier[0] if identifier else None
    XLM_Law = root.xpath(
        "//bwb:locatie_toestand/text()",
        namespaces=ns
    )[0]
    creator = get(record, "creator")
    creator = creator[0] if creator else None

    url_Law = f"https://wetten.overheid.nl/{identifier}/"

    print("TITLE:", title[0] if title else "N/A")
    print("Creator:", creator[0] if creator else "N/A")
    print(url_Law)
    print("-" * 40)

    law_response = requests.get(XLM_Law)
    law_root = etree.fromstring(law_response.content)

    articles = law_root.xpath("//artikel")

    all_articles = []

    for art in articles:
        number = art.xpath("./kop/nr/text()")
        text = art.xpath(".//lid//text()[normalize-space()]")

        article = f"### Artikel {''.join(number)}\n{' '.join(text)}"

        all_articles.append(article)

    full_law_text = "\n\n".join(all_articles)

    print(full_law_text)

    data = {
        "title": title,
        "creator": creator,
        "url": url_Law,
        "text": full_law_text
    }

    response = requests.post(endpoint, json=data)

