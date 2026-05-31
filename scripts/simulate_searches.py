#!/usr/bin/env python3
"""Simulate Usage Analytics (UA) search traffic so the Coveo ML Query
Suggestions (QS) model has data to train on.

The QS model builds its candidate suggestions from the `queryText` of search
events recorded in Usage Analytics. A brand-new catalog has no traffic, so the
model stays empty ("Model is empty and won't return responses"). This script
fetches every Pokemon name from the index and logs realistic search events for
each one, using a different visitor id per event so they count as distinct
traffic.

Credentials are read from the environment (never stored on disk):
  COVEO_ORG            organization id
  COVEO_ACCESS_TOKEN   search token (must allow analytics write)

After running, REBUILD the QS model in the Coveo admin console
(Machine Learning -> Models -> your QS model -> Rebuild), or wait for its
scheduled rebuild. Suggestions will then start returning.
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
ANALYTICS = f"https://{ORG}.analytics.org.coveo.com/rest/ua/v15/analytics/search"
SOURCE_FILTER = '@source=="push API solution"'

# Number of search events to log per Pokemon name. More repeats = stronger
# signal for the model (and a few names get extra weight to look organic).
REPEATS = 3


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


def fetch_names():
    """Page through the index and collect every Pokemon title."""
    names = []
    first = 0
    while True:
        _, b = post(
            SEARCH,
            {
                "q": "",
                "cq": SOURCE_FILTER,
                "numberOfResults": 200,
                "firstResult": first,
            },
            {"Authorization": f"Bearer {TOKEN}"},
        )
        data = json.loads(b)
        results = data.get("results", [])
        if not results:
            break
        names.extend(r["title"] for r in results)
        first += len(results)
        if first >= data.get("totalCount", 0):
            break
    return sorted(set(names))


def log_search(query):
    """Log one UA search event for the given query text (with retries)."""
    visitor = uuid.uuid4()
    body = {
        "language": "en",
        "userAgent": "Mozilla/5.0 (simulated catalog traffic)",
        "originLevel1": "default",
        "originLevel2": "default",
        "originLevel3": "localhost",
        "queryText": query,
        "actionCause": "searchboxSubmit",
        "actionType": "search box",
        "numberOfResults": random.randint(1, 20),
        "responseTime": random.randint(30, 250),
        "searchQueryUid": str(uuid.uuid4()),
        "anonymous": True,
    }
    for attempt in range(4):
        try:
            post(
                f"{ANALYTICS}?org={ORG}&visitor={visitor}",
                body,
                {"Authorization": f"Bearer {TOKEN}"},
            )
            return True
        except Exception:
            # Transient DNS/network/429 errors: back off and retry.
            time.sleep(0.5 * (attempt + 1))
    return False


def main():
    print("Fetching Pokemon names from the index...")
    names = fetch_names()
    print(f"  {len(names)} unique names")

    jobs = [name for name in names for _ in range(REPEATS)]
    random.shuffle(jobs)
    print(f"Logging {len(jobs)} simulated search events...")

    ok = 0
    with ThreadPoolExecutor(max_workers=10) as pool:
        for i, success in enumerate(pool.map(log_search, jobs), 1):
            ok += 1 if success else 0
            if i % 200 == 0:
                print(f"  {i}/{len(jobs)} sent")

    print(f"Done. {ok}/{len(jobs)} events accepted.")
    print(
        "Next: rebuild the QS model in the Coveo admin console "
        "(Machine Learning -> Models -> your QS model -> Rebuild), "
        "or wait for its scheduled rebuild."
    )


if __name__ == "__main__":
    main()
