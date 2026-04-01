import requests
from lxml import etree
import json
from pathlib import Path

# check and load JSON file containing all laws currently in the system
STATE_FILE = Path("processed_laws.json")

if STATE_FILE.exists():
    with open(STATE_FILE, "r") as f:
        processed_laws = set(json.load(f))
else:
    processed_laws = set()

url = "https://zoekdienst.overheid.nl/sru/Search"
endpoint = "http://127.0.0.1:8000/laws/process"

# decide on the parameters for the SRU search of the law database
params = {
    "operation": "searchRetrieve",
    "version": "1.2",
    "x-connection": "bwb",
    "query": 'modified >= "2026-02-01"',
    "maximumRecords": 10,
}

# all namespaces used to gather data from the SRU
ns = {
    "srw": "http://www.loc.gov/zing/srw/",
    "dcterms": "http://purl.org/dc/terms/",
    "bwb": "http://standaarden.overheid.nl/bwb/terms/"
}

parser = etree.XMLParser(recover=True)


def get(record, tag):
    return record.xpath(f".//dcterms:{tag}/text()", namespaces=ns)


# The function below processes a record and sends it to the interface
# Used in the loop at the end of this script, when a new Law has been found
def process_record(record):
    # get all info from the SRU search which only contains metadata
    title = get(record, "title")[0]
    identifier = get(record, "identifier")[0]
    creator = get(record, "creator")[0]

    # this is the Xml and url of the full page with all article info
    xml_law = record.xpath(
        ".//bwb:locatie_toestand/text()",
        namespaces=ns
    )[0]
    url_law = f"https://wetten.overheid.nl/{identifier}/"

    # print current Law information
    print("TITLE:", title if title else "N/A")
    print("Creator:", creator if creator else "N/A")
    print(url_law)
    print(xml_law)
    print("-" * 40)

    # get all information from the Xml of the Law page
    law_response = requests.get(xml_law)
    law_root = etree.fromstring(law_response.content)

    articles = law_root.xpath("//artikel")  # get all articles from the XML page

    all_articles = []

    # Go through all articles gathered before and combine only the useful info into one large string with all law info
    for art in articles:
        number = art.xpath("./kop/nr/text()")
        text = art.xpath(".//lid//text()[normalize-space()]")

        article = f"### Artikel {''.join(number)}\n{' '.join(text)}"

        all_articles.append(article)

    full_law_text = "\n\n".join(all_articles)

    # send the data to the interface
    data = {
        "title": title,
        "creator": creator,
        "url": url_law,
        "text": full_law_text
    }

    # send data to the front end
    response_interface = requests.post(endpoint, json=data)

    if response_interface.status_code == 200:
        processed_laws.add(identifier)

        with open(STATE_FILE, "w") as f:
            json.dump(list(processed_laws), f)


start_record = 1

# loop through 10 records each time
while True:

    params["startRecord"] = start_record

    response = requests.get(url, params=params)
    root = etree.fromstring(response.content, parser)

    records = root.xpath("//srw:record", namespaces=ns)

    if not records:
        print("No new laws available")
        break

    found = False

    for record in records:
        identifier = get(record, "identifier")[0]

        if identifier in processed_laws:
            continue

        selected_record = record
        found = True
        process_record(selected_record)
        break

    if found:
        break

    start_record += 10
