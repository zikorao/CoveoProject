#!/usr/bin/env python3
"""Ingest all Pokemon from PokeAPI into a Coveo Push source.

Builds one clean document per Pokemon species with:
  - title       : display name
  - type        : multi-value (e.g. ["Grass","Poison"])
  - generation  : integer 1-9
  - picture     : official artwork URL
  - description : English genus + Pokedex flavor text (for RGA grounding)

Credentials are read from the environment so the API key is never stored on disk:
  COVEO_ORG, COVEO_SOURCE, COVEO_PUSH_KEY
"""
import json
import os
import sys
import time
import urllib.request
import urllib.error

ORG = os.environ["COVEO_ORG"]
SOURCE = os.environ["COVEO_SOURCE"]
KEY = os.environ["COVEO_PUSH_KEY"]

POKEAPI = "https://pokeapi.co/api/v2"
ARTWORK = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/{id}.png"
PUSH_BASE = "https://api.cloud.coveo.com/push/v1/organizations/{org}".format(org=ORG)

GEN_WORDS = {
    "generation-i": 1, "generation-ii": 2, "generation-iii": 3,
    "generation-iv": 4, "generation-v": 5, "generation-vi": 6,
    "generation-vii": 7, "generation-viii": 8, "generation-ix": 9,
}
TYPE_NAMES = [
    "normal", "fighting", "flying", "poison", "ground", "rock", "bug",
    "ghost", "steel", "fire", "water", "grass", "electric", "psychic",
    "ice", "dragon", "dark", "fairy",
]

UA = "CoveoZikora-Ingest/1.0 (+https://pokemondb.net)"
SPECIES_CACHE = {}


def http(method, url, body=None, headers=None, raw=False):
    data = body if raw else (json.dumps(body).encode() if body is not None else None)
    hdrs = {"User-Agent": UA, **(headers or {})}
    req = urllib.request.Request(url, data=data, method=method, headers=hdrs)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status, r.read()


def get_json(url):
    s, b = http("GET", url, headers={"Accept": "application/json"})
    return json.loads(b)


def id_from_url(url):
    return int(url.rstrip("/").split("/")[-1])


def clean_text(text):
    return " ".join(text.replace("\f", " ").replace("\n", " ").split())


def species_description(name):
    if name in SPECIES_CACHE:
        return SPECIES_CACHE[name]

    try:
        data = get_json(f"{POKEAPI}/pokemon-species/{name}")
    except urllib.error.URLError:
        SPECIES_CACHE[name] = ""
        return ""

    genus = ""
    for entry in data.get("genus", []):
        if entry.get("language", {}).get("name") == "en":
            genus = entry.get("genus", "")
            break

    flavor = ""
    for entry in data.get("flavor_text_entries", []):
        if entry.get("language", {}).get("name") == "en":
            flavor = clean_text(entry.get("flavor_text", ""))
            break

    parts = []
    if genus:
        parts.append(f"The {genus}.")
    if flavor:
        parts.append(flavor)

    description = " ".join(parts)
    SPECIES_CACHE[name] = description
    time.sleep(0.08)
    return description


def build_documents():
    species = {}
    for word, gen in GEN_WORDS.items():
        data = get_json(f"{POKEAPI}/generation/{gen}")
        for sp in data["pokemon_species"]:
            species[sp["name"]] = {"id": id_from_url(sp["url"]), "generation": gen}
        print(f"  generation {gen}: {len(data['pokemon_species'])} species")

    type_map = {}
    for tname in TYPE_NAMES:
        data = get_json(f"{POKEAPI}/type/{tname}")
        label = tname.capitalize()
        for entry in data["pokemon"]:
            type_map.setdefault(entry["pokemon"]["name"], []).append(
                (entry["slot"], label)
            )
    print(f"  type map built for {len(type_map)} pokemon")

    print("  fetching species descriptions for RGA...")
    docs = []
    for idx, (name, info) in enumerate(species.items(), start=1):
        types = [t for _, t in sorted(type_map.get(name, []))]
        title = name.replace("-", " ").title()
        type_label = "/".join(types) if types else "Unknown"
        description = species_description(name)
        summary = (
            f"{title} is a {type_label} type Pokemon from Generation {info['generation']}."
        )
        if description:
            summary = f"{summary} {description}"

        docs.append({
            "documentId": f"https://pokemondb.net/pokedex/{name}",
            "title": title,
            "clickableUri": f"https://pokemondb.net/pokedex/{name}",
            "fileExtension": ".html",
            "data": summary,
            "description": summary,
            "type": types,
            "generation": info["generation"],
            "picture": ARTWORK.format(id=info["id"]),
        })
        if idx % 100 == 0:
            print(f"    {idx}/{len(species)} descriptions fetched")

    return docs


def push(docs):
    auth = {"Authorization": f"Bearer {KEY}"}

    s, b = http("POST", f"{PUSH_BASE}/files",
                headers={**auth, "Content-Type": "application/json"})
    container = json.loads(b)
    upload_uri = container["uploadUri"]
    file_id = container["fileId"]
    req_headers = container.get("requiredHeaders", {})
    print(f"  file container: {file_id}")

    payload = json.dumps({"addOrUpdate": docs, "delete": []}).encode()
    s, b = http("PUT", upload_uri, body=payload, headers=req_headers, raw=True)
    print(f"  uploaded payload ({len(payload)} bytes) -> HTTP {s}")

    s, b = http("PUT",
                f"{PUSH_BASE}/sources/{SOURCE}/documents/batch?fileId={file_id}",
                headers={**auth, "Content-Type": "application/json"})
    print(f"  batch ingest -> HTTP {s} {b.decode()[:200]}")


def main():
    print("Fetching from PokeAPI...")
    docs = build_documents()
    print(f"Built {len(docs)} documents. Example:")
    print(json.dumps(docs[0], indent=2))
    print("Pushing to Coveo...")
    push(docs)
    print("Done.")


if __name__ == "__main__":
    main()
