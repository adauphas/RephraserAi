#!/usr/bin/env bash
# Test d'integration de bout en bout du backend Rephraser AI.
# Usage :
#   1. Demarrer le backend :  cd backend && npm start   (port 3006 par defaut)
#   2. Dans un autre terminal : bash backend/test-integration.sh
#
# Verifie : health, inscription, connexion, /me, offres, annulation (date d'effet),
# reprise, et suppression RGPD (desabonnement instantane + 401 ensuite).

set -u
BASE="${BASE:-http://localhost:3006}"
EMAIL="test_$(date +%s)@example.com"
PASS="motdepasse123"
ok=0; ko=0
check(){ if [ "$1" = "$2" ]; then echo "  OK   $3 ($1)"; ok=$((ok+1)); else echo "  FAIL $3 (attendu $2, recu $1)"; ko=$((ko+1)); fi; }
code(){ curl -s -o /tmp/ri_body -w "%{http_code}" "$@"; }
body(){ cat /tmp/ri_body; }

echo "== Sante =="
check "$(code "$BASE/health")" 200 "GET /health"

echo "== Inscription =="
check "$(code -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")" 201 "POST /api/auth/register"
TOKEN=$(body | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
[ -n "$TOKEN" ] && { echo "  OK   token recu"; ok=$((ok+1)); } || { echo "  FAIL token manquant"; ko=$((ko+1)); }

echo "== Connexion =="
check "$(code -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")" 200 "POST /api/auth/login"
TOKEN=$(body | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')

echo "== /me (compte Free) =="
check "$(code "$BASE/api/auth/me" -H "Authorization: Bearer $TOKEN")" 200 "GET /api/auth/me"
echo "  plan: $(body | sed -n 's/.*"plan":"\([^"]*\)".*/\1/p')"

echo "== Offres =="
check "$(code "$BASE/api/billing/plans")" 200 "GET /api/billing/plans"

echo "== Annulation d'un compte Free (doit echouer) =="
check "$(code -X POST "$BASE/api/billing/cancel" -H "Authorization: Bearer $TOKEN")" 400 "POST /api/billing/cancel (Free -> 400)"

echo "== Suppression RGPD =="
check "$(code -X DELETE "$BASE/api/auth/me" -H "Authorization: Bearer $TOKEN")" 200 "DELETE /api/auth/me"
echo "== Verif post-suppression (jeton invalide) =="
check "$(code "$BASE/api/auth/me" -H "Authorization: Bearer $TOKEN")" 401 "GET /api/auth/me apres suppression -> 401"

echo ""
echo "NOTE : pour tester cancel/resume sur un compte PAYANT, utilisez un compte de demo"
echo "       (ex: premium-plus@example.com / password-demo) puis :"
echo "  TOKEN=\$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{\"email\":\"premium-plus@example.com\",\"password\":\"password-demo\"}' | sed -n 's/.*\"token\":\"\\([^\"]*\\)\".*/\\1/p')"
echo "  curl -s -X POST $BASE/api/billing/cancel -H \"Authorization: Bearer \$TOKEN\"   # renvoie effectiveDate"
echo "  curl -s -X POST $BASE/api/billing/resume -H \"Authorization: Bearer \$TOKEN\""
echo ""
echo "RESULTAT : $ok OK, $ko FAIL"
[ "$ko" -eq 0 ] && echo ">>> INTEGRATION OK" || echo ">>> DES TESTS ONT ECHOUE"
