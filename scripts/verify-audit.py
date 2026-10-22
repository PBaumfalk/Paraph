#!/usr/bin/env python3
"""Unabhängige Prüfung eines Paraph-Nachweispakets – ohne Paraph, nur Python-Standardbibliothek.

1. Audit-Trail (03_audit-trail.json): Jeder Eintrag hat hash = SHA-256 über kanonisches JSON
   {envelope_id, seq, ts, type, actor, data, prev_hash} (Schlüssel sortiert, ohne Leerzeichen, UTF-8).
   prev_hash verweist auf den vorherigen Eintrag; der erste auf 64 Nullen.
2. Verankerung (08_verankerung.json, falls vorhanden): Der Kettenkopf zum Zeitpunkt der Verankerung ist per
   Merkle-Prüfpfad (RFC 6962/9162) in der Ankerwurzel enthalten; der Ankerhash ist mit einem RFC-3161-Zeitstempel
   eines unabhängigen Dienstes bestätigt. Die Zeitstempel werden als .tsr-Dateien abgelegt; der Befehl zur Prüfung
   mit OpenSSL wird ausgegeben (dafür wird das Zertifikat des Zeitstempeldienstes benötigt).
Aufruf: python3 verify-audit.py 03_audit-trail.json
"""
import base64, hashlib, json, os, sys

def canon(v):
    return json.dumps(v, sort_keys=True, separators=(",", ":"), ensure_ascii=False)

def sha(b):
    return hashlib.sha256(b).digest()

def root_from_proof(leaf, index, size, proof):
    # RFC 9162, Abschnitt 2.1.3.2
    if index >= size:
        raise ValueError("Index außerhalb des Baums")
    fn, sn, r = index, size - 1, leaf
    for p in proof:
        if sn == 0:
            raise ValueError("Prüfpfad zu lang")
        if fn % 2 == 1 or fn == sn:
            r = sha(b"\x01" + p + r)
            if fn % 2 == 0:
                while fn % 2 == 0 and fn != 0:
                    fn >>= 1
                    sn >>= 1
        else:
            r = sha(b"\x01" + r + p)
        fn >>= 1
        sn >>= 1
    if sn != 0:
        raise ValueError("Prüfpfad zu kurz")
    return r

def check_anchors(path, env, hashes):
    doc = json.load(open(path, encoding="utf-8"))
    out_dir = os.path.dirname(os.path.abspath(path))
    rc = 0
    for a in doc["anchors"]:
        anc, leaf = a["anchor"], a["leaf"]
        lid = f"Anker {anc['id']}"
        if hashes.get(leaf["seq"]) != leaf["head"]:
            print(f"FEHLER: {lid}: Kettenkopf bei Eintrag {leaf['seq']} weicht vom verankerten Stand ab"); rc = 2; continue
        lh = sha(b"\x00" + f"{env}:{leaf['seq']}:{leaf['head']}".encode("utf-8"))
        try:
            root = root_from_proof(lh, leaf["index"], anc["leaves"], [bytes.fromhex(p) for p in a["proof"]])
        except ValueError as e:
            print(f"FEHLER: {lid}: {e}"); rc = 2; continue
        if root.hex() != anc["root"]:
            print(f"FEHLER: {lid}: Merkle-Prüfpfad führt nicht zur Ankerwurzel"); rc = 2; continue
        ah = hashlib.sha256(canon({"format": "paraph-anchor/1", "id": anc["id"], "created_at": anc["created_at"], "prev_hash": anc["prev_hash"], "root": anc["root"], "leaves": anc["leaves"]}).encode("utf-8")).hexdigest()
        if ah != anc["anchor_hash"]:
            print(f"FEHLER: {lid}: Ankerhash stimmt nicht"); rc = 2; continue
        ts = a.get("timestamp")
        if ts:
            f = os.path.join(out_dir, f"anker-{anc['id']}.tsr")
            open(f, "wb").write(base64.b64decode(ts["token_der_base64"]))
            print(f"OK: {lid}: Einträge 1–{leaf['seq']} verankert, Zeitstempel {ts['genTime']}")
            print(f"    Zeitstempel prüfen: openssl ts -verify -digest {ah} -in {os.path.basename(f)} -token_in -CAfile <Zertifikat des Zeitstempeldienstes>")
        else:
            print(f"OK: {lid}: Einträge 1–{leaf['seq']} verankert (ohne externen Zeitstempel – nur interne Bestätigung)")
    return rc

def main(path):
    doc = json.load(open(path, encoding="utf-8"))
    env = doc["envelope"]["id"]
    prev = "0" * 64
    hashes = {}
    for i, e in enumerate(doc["events"], 1):
        if e["seq"] != i or e["prev_hash"] != prev:
            print(f"FEHLER: Verkettung bei Eintrag {e['seq']} unterbrochen"); return 2
        body = {"envelope_id": env, "seq": e["seq"], "ts": e["ts"], "type": e["type"], "actor": e["actor"], "data": e["data"], "prev_hash": e["prev_hash"]}
        h = hashlib.sha256(canon(body).encode("utf-8")).hexdigest()
        if h != e["hash"]:
            print(f"FEHLER: Eintrag {e['seq']} ({e['type']}) wurde verändert"); return 2
        hashes[e["seq"]] = h
        prev = h
    print(f"OK: {len(doc['events'])} Einträge lückenlos verkettet, Kettenkopf {prev}")
    rc = 0
    if doc.get("chain", {}).get("head") and doc["chain"]["head"] != prev:
        print("HINWEIS: Kettenkopf weicht vom im Dokument angegebenen Kopf ab"); rc = 1
    anchors = os.path.join(os.path.dirname(os.path.abspath(path)), "08_verankerung.json")
    if os.path.exists(anchors):
        rc = max(rc, check_anchors(anchors, env, hashes))
    else:
        print("HINWEIS: Keine Verankerung im Paket (Vorgang wurde vor der ersten Verankerung abgeschlossen).")
    return rc

if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
