#!/usr/bin/env bash
#
# Force-reset a Kratos identity's password via the Admin API.
#
# Usage:
#   ./scripts/reset-password.sh [email] [password]
#
# Defaults: pavelpal.d@gmail.com / helloWorld12345
#
# Requires the Kratos admin API to be reachable (published on :4434 by
# docker-compose). Override with KRATOS_ADMIN_URL if needed.

set -euo pipefail

EMAIL="${1:-pavelpal.d@gmail.com}"
PASSWORD="${2:-helloWorld12345}"
ADMIN="${KRATOS_ADMIN_URL:-http://localhost:4434}"

echo "→ Looking up identity for ${EMAIL} ..."
ID="$(curl -s "${ADMIN}/admin/identities?credentials_identifier=${EMAIL}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if d else '')")"

if [ -z "${ID}" ]; then
  echo "✗ No identity found for ${EMAIL}" >&2
  exit 1
fi
echo "  found: ${ID}"

# Build an UpdateIdentity body from the current identity, preserving traits and
# keeping the email verified, and set the new password.
BODY="$(curl -s "${ADMIN}/admin/identities/${ID}" \
  | PASSWORD="${PASSWORD}" python3 -c "
import sys, json, os
i = json.load(sys.stdin)
print(json.dumps({
  'schema_id': i['schema_id'],
  'state': 'active',
  'traits': i['traits'],
  'verifiable_addresses': [
    {'value': a['value'], 'verified': True, 'via': a.get('via', 'email'), 'status': 'completed'}
    for a in i.get('verifiable_addresses', [])
  ],
  'credentials': {'password': {'config': {'password': os.environ['PASSWORD']}}},
}))")"

echo "→ Resetting password ..."
HTTP="$(curl -s -o /tmp/reset-resp.json -w '%{http_code}' -X PUT \
  "${ADMIN}/admin/identities/${ID}" \
  -H "Content-Type: application/json" -d "${BODY}")"

if [ "${HTTP}" = "200" ]; then
  echo "✓ Password for ${EMAIL} is now: ${PASSWORD}"
  VERIFIED="$(python3 -c "
import json
d = json.load(open('/tmp/reset-resp.json'))
addrs = d.get('verifiable_addresses') or []
print(all(a.get('verified') for a in addrs) if addrs else True)")"
  if [ "${VERIFIED}" != "True" ]; then
    echo "⚠  Email is no longer marked verified — email-code MFA may not prompt."
    echo "   Re-run with a fresh verification, or use the clean reset (down -v)."
  fi
else
  echo "✗ Failed (HTTP ${HTTP}):" >&2
  cat /tmp/reset-resp.json >&2
  echo >&2
  exit 1
fi
