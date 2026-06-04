#!/usr/bin/env python3
"""Retrieve ranked passages from the Coveo Passage Retrieval API (PR API).

Requires a Contextual Passage Retrieval (CPR) model and Semantic Encoder (SE)
associated on the same query pipeline as live search (pokemon-zikora).

Credentials:
  COVEO_ORG
  COVEO_ACCESS_TOKEN

Usage:
  python3 scripts/retrieve_passages.py
  python3 scripts/retrieve_passages.py --query "What type is Pikachu?"
  python3 scripts/retrieve_passages.py --max-passages 3

Do not pass searchHub unless it matches the API key hub exactly (often Pokemon-zikora).
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request

ORG = os.environ.get("COVEO_ORG", "")
TOKEN = os.environ.get("COVEO_ACCESS_TOKEN", "")
SOURCE_FILTER = '@source=="push API solution"'
DEFAULT_QUERY = "What type is Pikachu and what generation is it from?"


def retrieve(query, max_passages, search_hub, extra_fields):
    url = f"https://{ORG}.org.coveo.com/rest/search/v3/passages/retrieve"
    body = {
        "query": query,
        "filter": SOURCE_FILTER,
        "additionalFields": extra_fields,
        "maxPassages": max_passages,
        "localization": {"locale": "en-US", "timezone": "America/New_York"},
        "analytics": {"capture": True, "userAgent": "PokeMart/1.0 passage-retrieval"},
    }
    if search_hub:
        body["searchHub"] = search_hub

    data = json.dumps(body).encode()
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read())


def main():
    parser = argparse.ArgumentParser(description="Coveo Passage Retrieval API")
    parser.add_argument("--query", default=DEFAULT_QUERY)
    parser.add_argument("--max-passages", type=int, default=5)
    parser.add_argument(
        "--search-hub",
        default="",
        help="Optional; must match token hub (e.g. Pokemon-zikora). Omit to use token default.",
    )
    parser.add_argument(
        "--fields",
        default="clickableuri,picture,type,generation",
        help="Comma-separated additionalFields",
    )
    args = parser.parse_args()

    if not ORG or not TOKEN:
        print("Set COVEO_ORG and COVEO_ACCESS_TOKEN.")
        sys.exit(1)

    fields = [f.strip() for f in args.fields.split(",") if f.strip()]
    hub = args.search_hub.strip() or None

    print("Passage Retrieval API")
    print("=" * 50)
    print(f"  query: {args.query!r}")
    print(f"  filter: {SOURCE_FILTER}")
    print(f"  maxPassages: {args.max_passages}")
    print(f"  searchHub: {hub or '(from token)'}")

    try:
        data = retrieve(args.query, args.max_passages, hub, fields)
    except urllib.error.HTTPError as e:
        print(f"\nHTTP {e.code}\n{e.read().decode()[:800]}")
        sys.exit(1)

    items = data.get("items") or []
    print(f"\nresponseId: {data.get('responseId')}")
    print(f"passages: {len(items)}\n")

    for i, item in enumerate(items, start=1):
        score = item.get("relevanceScore")
        text = (item.get("text") or "").strip()
        doc = item.get("document") or {}
        title = doc.get("title", "?")
        print(f"--- {i} (score={score}) {title} ---")
        preview = text[:500] + ("..." if len(text) > 500 else "")
        print(preview)
        print(f"  document: {json.dumps(doc, indent=2)[:300]}\n")

    sys.exit(0 if items else 1)


if __name__ == "__main__":
    main()
