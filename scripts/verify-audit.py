#!/usr/bin/env python3
"""Unabhängige Prüfung eines Paraph-Audit-Trails (03_audit-trail.json) – ohne Paraph, nur Python-Standardbibliothek.

Jeder Eintrag: hash = SHA-256 über kanonisches JSON {envelope_id, seq, ts, type, actor, data, prev_hash}
(Schlüssel sortiert, ohne Leerzeichen, UTF-8). prev_hash verweist auf den vorherigen Eintrag; der erste auf 64 Nullen.
Aufruf: python3 verify-audit.py 03_audit-trail.json
"""
import hashlib, json, sys

def canon(v):
    return json.dumps(v, sort_keys=True, separators=(",", ":"), ensure_ascii=False)

def main(path):
    doc = json.load(open(path, encoding="utf-8"))
    env = doc["envelope"]["id"]
    prev = "0" * 64
    for i, e in enumerate(doc["events"], 1):
        if e["seq"] != i or e["prev_hash"] != prev:
            print(f"FEHLER: Verkettung bei Eintrag {e['seq']} unterbrochen"); return 2
        body = {"envelope_id": env, "seq": e["seq"], "ts": e["ts"], "type": e["type"], "actor": e["actor"], "data": e["data"], "prev_hash": e["prev_hash"]}
        h = hashlib.sha256(canon(body).encode("utf-8")).hexdigest()
        if h != e["hash"]:
            print(f"FEHLER: Eintrag {e['seq']} ({e['type']}) wurde verändert"); return 2
        prev = h
    print(f"OK: {len(doc['events'])} Einträge lückenlos verkettet, Kettenkopf {prev}")
    if doc.get("chain", {}).get("head") and doc["chain"]["head"] != prev:
        print("HINWEIS: Kettenkopf weicht vom im Dokument angegebenen Kopf ab"); return 1
    return 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
