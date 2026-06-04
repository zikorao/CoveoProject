#!/usr/bin/env python3
"""Simulate Usage Analytics click events for Coveo ML ART training.

ART learns primarily from search + click pairs (query -> result opened). This
script searches each Pokemon by name, then logs a documentOpen click on the
top result with contentIdKey/contentIdValue (required for ART).

Credentials (from environment):
  COVEO_ORG
  COVEO_ACCESS_TOKEN

After running, rebuild the ART model in Coveo Admin or wait for the scheduled
rebuild, then run: python3 scripts/test_art.py
"""
import json
import os
import random
import time
import uuid
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ORG = os.environ["COVEO_ORG"]
TOKEN = os.environ["COVEO_ACCESS_TOKEN"]

SEARCH = f"https://{ORG}.org.coveo.com/rest/search/v2?organizationId={ORG}"
CLICK = f"https://{ORG}.analytics.org.coveo.com/rest/ua/v15/analytics/click"
SEARCH_ANALYTICS = f"https://{ORG}.analytics.org.coveo.com/rest/ua/v15/analytics/search"
SOURCE_FILTER = '@source=="push API solution"'
SOURCE_NAME = "push API solution"

# One search+click session per Pokemon name.
REPEATS = 1


def post(url, body, headers):
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={"Content-Type": "application/json", **headers},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status, r.read()


def fetch_pokemon():
    """Return list of {title, uri, permanentid, urihash} from the index."""
    items = []
    first = 0
    while True:
        _, b = post(
            SEARCH,
            {
                "q": "",
                "cq": SOURCE_FILTER,
                "numberOfResults": 200,
                "firstResult": first,
                "fieldsToInclude": ["permanentid"],
            },
            {"Authorization": f"Bearer {TOKEN}"},
        )
        data = json.loads(b)
        results = data.get("results", [])
        if not results:
            break
        for r in results:
            raw = r.get("raw") or {}
            items.append(
                {
                    "title": r.get("title", ""),
                    "uri": r.get("clickUri") or r.get("uri", ""),
                    "permanentid": raw.get("permanentid", ""),
                    "urihash": raw.get("urihash", r.get("uriHash", "")),
                }
            )
        first += len(results)
        if first >= data.get("totalCount", 0):
            break
    return items


def search_and_click(title):
    """Log one search for `title`, then click the top matching result."""
    visitor = str(uuid.uuid4())
    auth = {"Authorization": f"Bearer {TOKEN}"}

    for attempt in range(4):
        try:
            # 1) Run search to obtain searchUid + result metadata
            _, b = post(
                SEARCH,
                {"q": title, "cq": SOURCE_FILTER, "numberOfResults": 1},
                auth,
            )
            data = json.loads(b)
            results = data.get("results", [])
            if not results:
                return False

            r = results[0]
            raw = r.get("raw") or {}
            permanentid = raw.get("permanentid", "")
            if not permanentid:
                return False

            search_query_uid = data.get("searchUid", str(uuid.uuid4()))

            # 2) UA search event (same searchQueryUid as the click)
            search_body = {
                "language": "en",
                "userAgent": "Mozilla/5.0 (simulated ART training)",
                "originLevel1": "pokemon-zikora",
                "originLevel2": "default",
                "originLevel3": "localhost",
                "queryText": title,
                "actionCause": "searchboxSubmit",
                "actionType": "search box",
                "numberOfResults": len(results),
                "responseTime": random.randint(40, 200),
                "searchQueryUid": search_query_uid,
                "anonymous": True,
            }
            post(
                f"{SEARCH_ANALYTICS}?org={ORG}&visitor={visitor}",
                search_body,
                auth,
            )

            # 3) UA click on the top result (ART training signal)
            click_body = {
                "language": "en",
                "userAgent": "Mozilla/5.0 (simulated ART training)",
                "originLevel1": "pokemon-zikora",
                "originLevel2": "default",
                "originLevel3": "localhost",
                "searchQueryUid": search_query_uid,
                "actionCause": "documentOpen",
                "sourceName": SOURCE_NAME,
                "documentTitle": r.get("title", title),
                "documentUrl": r.get("clickUri") or r.get("uri", ""),
                "documentUriHash": raw.get("urihash", ""),
                "documentPosition": 1,
                "customData": {
                    "contentIdKey": "permanentid",
                    "contentIdValue": permanentid,
                },
                "anonymous": True,
            }
            post(f"{CLICK}?org={ORG}&visitor={visitor}", click_body, auth)
            return True
        except Exception:
            time.sleep(0.5 * (attempt + 1))
    return False


def main():
    print("Fetching Pokemon from the index...")
    items = fetch_pokemon()
    titles = sorted({p["title"] for p in items if p["title"]})
    print(f"  {len(titles)} unique names")

    jobs = [t for t in titles for _ in range(REPEATS)]
    random.shuffle(jobs)
    print(f"Logging {len(jobs)} search+click sessions...")

    ok = 0
    with ThreadPoolExecutor(max_workers=6) as pool:
        for i, success in enumerate(pool.map(search_and_click, jobs), 1):
            ok += 1 if success else 0
            if i % 100 == 0:
                print(f"  {i}/{len(jobs)} done")

    print(f"Done. {ok}/{len(jobs)} sessions accepted.")
    print(
        "Next: rebuild the ART model in Coveo Admin "
        "(Machine Learning -> Models -> your ART model -> Rebuild), "
        "then run: python3 scripts/test_art.py"
    )


if __name__ == "__main__":
    main()
