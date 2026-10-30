#!/usr/bin/env bash
set -e
TARGET="${TARGET:-http://localhost:3000}"
ZAP_PORT=8090
ZAP="http://127.0.0.1:$ZAP_PORT"

export JAVA_HOME=/usr/lib/jvm/java-21-openjdk
export PATH="$JAVA_HOME/bin:$PATH"

echo "Arrancando ZAP daemon..."
~/zap/zap.sh -daemon -host 127.0.0.1 -port "$ZAP_PORT" -config api.disablekey=true >/tmp/zap.log 2>&1 &
for i in $(seq 1 60); do
  curl -s --max-time 2 "$ZAP/JSON/core/view/version/" >/dev/null && break
  sleep 2
done
curl -s "$ZAP/JSON/core/view/version/"
echo

echo "Spider clasico..."
curl -s "$ZAP/JSON/spider/action/scan/?url=$TARGET" >/dev/null
echo "AJAX spider..."
curl -s "$ZAP/JSON/ajaxSpider/action/scan/?url=$TARGET" >/dev/null

echo "Esperando cola pasiva..."
while [ "$(curl -s "$ZAP/JSON/pscan/view/recordsToScan/" 2>/dev/null | grep -o '[0-9]*' | head -1)" != "0" ]; do
  sleep 5
done

echo "=== ALERTAS ==="
curl -s "$ZAP/JSON/core/view/alerts/?baseurl=$TARGET" | python3 -c '
import sys, json
d = json.load(sys.stdin)
from collections import Counter
print(Counter(a["risk"] for a in d.get("alerts", [])))
for a in d.get("alerts", []):
    print(f"[{a[\"risk\"]}] {a[\"name\"]}")
'

mkdir -p docs/security
curl -s "$ZAP/OTHER/core/other/htmlreport/" -o "docs/security/zap-baseline-$(date +%F).html"
echo "Informe guardado en docs/security/"

curl -s "$ZAP/JSON/core/action/shutdown/" >/dev/null
echo "ZAP apagado. Listo."
