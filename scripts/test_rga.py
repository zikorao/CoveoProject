#!/usr/bin/env python3
"""Verify Relevance Generative Answering (RGA) for PokeMart.

Checks that the Search API returns a generativeQuestionAnsweringId, streams
the ML response, and reports whether an answer was generated.

Credentials (from environment):
  COVEO_ORG
  COVEO_ACCESS_TOKEN

Usage:
  python3 scripts/test_rga.py
  python3 scripts/test_rga.py --include-crawl   # also test without push-only cq

Exit code: 0 if the RGA stream completes; 1 if the API is unreachable.
"""
import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request

ORG = os.environ.get("COVEO_ORG", "")
TOKEN = os.environ.get("COVEO_ACCESS_TOKEN", "")
SOURCE_FILTER = '@source=="push API solution"'
DEFAULT_QUERY = "pikachu"


def post(url, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def stream_rga(stream_id):
    url = (
        f"https://{ORG}.org.coveo.com/rest/organizations/{ORG}/"
        f"machinelearning/streaming/{stream_id}"
    )
    req = urllib.request.Request(
        url,
        method="GET",
        headers={"Authorization": f"Bearer {TOKEN}", "Accept": "*/*"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read().decode("utf-8", errors="replace")


def parse_stream(raw):
    answer_parts = []
    citations = []
    generated = None
    error_message = None

    for match in re.finditer(r"data:(\{.*?\})\n", raw):
        event = json.loads(match.group(1))
        payload_type = event.get("payloadType")
        payload_raw = event.get("payload") or "{}"
        try:
            payload = json.loads(payload_raw) if isinstance(payload_raw, str) else payload_raw
        except json.JSONDecodeError:
            payload = {}

        if event.get("errorMessage"):
            error_message = event["errorMessage"]

        if payload_type == "genqa.messageType":
            answer_parts.append(payload.get("textDelta", ""))
        elif payload_type == "genqa.citationsType":
            for cite in payload.get("citations") or []:
                citations.append(
                    {
                        "title": cite.get("title"),
                        "uri": cite.get("uri") or cite.get("clickUri"),
                        "source": cite.get("source"),
                    }
                )
        elif payload_type == "genqa.endOfStreamType":
            generated = payload.get("answerGenerated")

    return {
        "answer": "".join(answer_parts).strip(),
        "citations": citations,
        "answer_generated": generated,
        "error_message": error_message,
    }


def check(label, ok):
    status = "PASS" if ok else "FAIL/WARN"
    print(f"  [{status}] {label}")
    return ok


def run_scenario(name, query, cq):
    search_url = f"https://{ORG}.org.coveo.com/rest/search/v2?organizationId={ORG}"
    body = {"q": query, "numberOfResults": 10}
    if cq is not None:
        body["cq"] = cq

    print(f"\n--- {name} ---")
    print(f"  query: {query!r}")
    print(f"  cq: {cq if cq is not None else '(none)'}")

    d = post(search_url, body)
    stream_id = (d.get("extendedResults") or {}).get("generativeQuestionAnsweringId")
    print(f"  pipeline: {d.get('pipeline')}")
    print(f"  totalCount: {d.get('totalCount')}")
    print(f"  searchUid: {d.get('searchUid', '')}")

    passed = 0
    total = 0

    if check("generativeQuestionAnsweringId present", bool(stream_id)):
        passed += 1
    total += 1

    if not stream_id:
        return passed, total

    try:
        raw = stream_rga(stream_id)
        parsed = parse_stream(raw)
    except urllib.error.URLError as e:
        check(f"RGA stream reachable ({e})", False)
        return passed, total + 1

    if check("RGA stream completed", "genqa.endOfStreamType" in raw):
        passed += 1
    total += 1

    gen = parsed["answer_generated"]
    if check("answerGenerated=true", gen is True):
        passed += 1
    total += 1

    if parsed["answer"]:
        preview = parsed["answer"][:400]
        if len(parsed["answer"]) > 400:
            preview += "..."
        print(f"\n  Answer preview:\n  {preview}")

    if parsed["citations"]:
        print(f"\n  Citations ({len(parsed['citations'])}):")
        for cite in parsed["citations"][:3]:
            print(f"    - {cite.get('title')} ({cite.get('source')})")

    if gen is False:
        print(
            "\n  RGA ran but did not generate an answer for this context.\n"
            "  Typical fixes: re-run push_pokemon.py (HTML + descriptions),\n"
            "  signal IDLE rebuild, confirm RGA includes push API solution in Admin."
        )

    if parsed["error_message"]:
        print(f"\n  Stream error: {parsed['error_message']}")

    return passed, total


def main():
    parser = argparse.ArgumentParser(description="Test Coveo RGA for PokeMart")
    parser.add_argument("--query", default=DEFAULT_QUERY, help="Search query")
    parser.add_argument(
        "--include-crawl",
        action="store_true",
        help="Also run without cq (includes pokemondb crawl for comparison)",
    )
    args = parser.parse_args()

    if not ORG or not TOKEN:
        print("Set COVEO_ORG and COVEO_ACCESS_TOKEN in the environment.")
        sys.exit(1)

    print("\nRGA verification")
    print("=" * 50)

    total_passed = 0
    total_checks = 0

    try:
        p, t = run_scenario(
            "PokeMart index (push source only)",
            args.query,
            SOURCE_FILTER,
        )
        total_passed += p
        total_checks += t

        if args.include_crawl:
            p, t = run_scenario(
                "Full index (no cq - includes crawl)",
                args.query,
                None,
            )
            total_passed += p
            total_checks += t
    except urllib.error.URLError as e:
        print(f"\n  [FAIL] Search API reachable ({e})")
        sys.exit(1)

    print(f"\n{total_passed}/{total_checks} checks passed")
    sys.exit(0)


if __name__ == "__main__":
    main()
