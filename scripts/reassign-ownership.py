#!/usr/bin/env python3
"""
Make a single user the owner of ALL cars in Keto, removing any current owners.

Usage:
  ./scripts/reassign-ownership.py [email]

Default email: pavelpal.d@gmail.com

Talks to the Kratos Admin API (resolve email -> identity id) and the Keto
read/write APIs (swap the Car#owners tuples). Override hosts via env:
  KRATOS_ADMIN_URL (default http://localhost:4434)
  KETO_READ_URL    (default http://localhost:4466)
  KETO_WRITE_URL   (default http://localhost:4467)
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

ADMIN = os.environ.get("KRATOS_ADMIN_URL", "http://localhost:4434")
KREAD = os.environ.get("KETO_READ_URL", "http://localhost:4466")
KWRITE = os.environ.get("KETO_WRITE_URL", "http://localhost:4467")
EMAIL = sys.argv[1] if len(sys.argv) > 1 else "pavelpal.d@gmail.com"
KNOWN_CARS = ["c1", "c2", "c3", "c4", "c5", "c6"]


def get(url):
    with urllib.request.urlopen(url) as r:
        return json.load(r)


def send(url, method, body=None):
    data = json.dumps(body).encode() if body is not None else None
    rq = urllib.request.Request(
        url, data=data, method=method, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(rq) as r:
            return r.status
    except urllib.error.HTTPError as e:
        print(f"  ! {method} {url} -> {e.code} {e.read().decode()[:200]}", file=sys.stderr)
        return e.code


# 1) Resolve the target identity id.
identities = get(f"{ADMIN}/admin/identities?credentials_identifier={urllib.parse.quote(EMAIL)}")
if not identities:
    sys.exit(f"No Kratos identity found for {EMAIL} — register it first.")
owner_id = identities[0]["id"]
print(f"Target owner: {EMAIL} ({owner_id})")

# 2) Collect every car object (known list + anything already in Keto).
objects = set(KNOWN_CARS)
existing = get(f"{KREAD}/relation-tuples?namespace=Car&relation=owners&page_size=500")
for t in existing.get("relation_tuples", []):
    if t.get("object"):
        objects.add(t["object"])

# 3) For each car: delete current owner tuples, then add the new owner.
for car in sorted(objects):
    current = get(
        f"{KREAD}/relation-tuples?namespace=Car&object={car}&relation=owners&page_size=100"
    )
    for t in current.get("relation_tuples", []):
        sub = t.get("subject_id")
        if sub and sub != owner_id:
            send(
                f"{KWRITE}/admin/relation-tuples?namespace=Car&object={car}"
                f"&relation=owners&subject_id={urllib.parse.quote(sub)}",
                "DELETE",
            )
    send(
        f"{KWRITE}/admin/relation-tuples",
        "PUT",
        {"namespace": "Car", "object": car, "relation": "owners", "subject_id": owner_id},
    )
    print(f"  {car} -> {EMAIL}")

print("Done. Reload the store; all cars should show 'Owned by you'.")
