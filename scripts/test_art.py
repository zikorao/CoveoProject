#!/usr/bin/env python3
"""Verify Coveo Automatic Relevance Tuning (ART) readiness for PokeMart.

Runs a checklist against the Search API and local app. ART association in the
admin console is necessary but not sufficient; this script checks whether ML
ranking signals appear in API responses yet.

Credentials (from environment):
  COVEO_ORG
  COVEO_ACCESS_TOKEN

After associating ART, confirm in Coveo Admin -> Relevance Inspector using the
printed searchUid (Query pipeline rules and models -> Automatic Relevance Tuning).

Exit code: 0 if core search checks pass, 1 if the API is unreachable.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request

ORG = os.environ.get("COVEO_ORG", "")
TOKEN = os.environ.get("COVEO_ACCESS_TOKEN", "")
SOURCE_FILTER = '@source=="push API solution"'


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
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def check(name, ok):
    label = "PASS" if ok else "FAIL/WARN"
    print(f"  [{label}] {name}")
    return ok


def main():
    if not ORG or not TOKEN:
        print("Set COVEO_ORG and COVEO_ACCESS_TOKEN in the environment.")
        sys.exit(1)

    search_url = f"https://{ORG}.org.coveo.com/rest/search/v2?organizationId={ORG}"
    qs_url = f"https://{ORG}.org.coveo.com/rest/search/v2/querySuggest?organizationId={ORG}"

    print("\nART / ML verification checklist")
    print("=" * 50)

    passed = 0
    total = 0

    try:
        d = post(
            search_url,
            {
                "q": "pikachu",
                "cq": SOURCE_FILTER,
                "numberOfResults": 3,
                "debug": True,
            },
        )
    except urllib.error.URLError as e:
        print(f"  [FAIL] Search API reachable ({e})")
        sys.exit(1)

    search_uid = d.get("searchUid", "")
    top = (d.get("results") or [{}])[0]
    ranking_info = top.get("rankingInfo") or ""
    has_qre = bool(re.search(r"QRE: [1-9]", ranking_info))

    checks = [
        ("Search API reachable", True),
        (
            "Pipeline = pokemon-zikora",
            d.get("pipeline") == "Search pipeline - pokemon-zikora",
        ),
        ("Results for 'pikachu'", (d.get("totalCount") or 0) >= 1),
        ("ART QRE boost on top result (QRE > 0)", has_qre),
        ("rankingExpressions in response", bool(d.get("rankingExpressions"))),
    ]
    for name, ok in checks:
        if check(name, ok):
            passed += 1
        total += 1

    try:
        d2 = post(
            search_url,
            {
                "lq": "small yellow electric rodent",
                "cq": SOURCE_FILTER,
                "numberOfResults": 5,
            },
        )
        rk = d2.get("refinedKeywords") or []
        if check("refinedKeywords / ITD on lq query", len(rk) > 0):
            passed += 1
        total += 1
        if check("lq query returns results", (d2.get("totalCount") or 0) > 0):
            passed += 1
        total += 1
    except urllib.error.URLError:
        check("refinedKeywords / ITD on lq query", False)
        total += 1
        check("lq query returns results", False)
        total += 1

    try:
        qs = post(qs_url, {"count": 5})
        if check("QS model returns completions", len(qs.get("completions", [])) > 0):
            passed += 1
        total += 1
    except urllib.error.URLError:
        check("QS model returns completions", False)
        total += 1

    try:
        urllib.request.urlopen(urllib.request.Request("http://localhost:3000/"), timeout=5)
        if check("Local app http://localhost:3000", True):
            passed += 1
    except urllib.error.URLError:
        check("Local app http://localhost:3000", False)
    total += 1

    print(f"\n{passed}/{total} checks passed")
    print(f"\nRelevance Inspector searchUid:\n  {search_uid}")
    if ranking_info:
        print(f"\nTop result rankingInfo (snippet):\n  {ranking_info[:350]}...")

    if not has_qre:
        print(
            "\nART is associated in Admin but ML boosts are not visible yet.\n"
            "Typical causes:\n"
            "  - Model still Limited/Building or sparse click analytics\n"
            "  - Association condition/searchHub mismatch (token overrides searchHub)\n"
            "  - A/B test not at 100% traffic\n"
            "  - Run: python3 scripts/simulate_clicks.py to seed click events\n"
            "  - Rebuild ART after traffic; verify in Relevance Inspector"
        )

    sys.exit(0)


if __name__ == "__main__":
    main()
