#!/bin/bash
export PATH="$HOME/.local/share/dfx/bin:/usr/bin:/bin:$PATH"
pkill -9 -x dfx 2>/dev/null || true
pkill -9 -x pocket-ic 2>/dev/null || true
sleep 1

PIC="$HOME/.cache/dfinity/versions/0.32.0/pocket-ic"
ls -la "$PIC"
"$PIC" --help 2>&1 | head -40

# Start pocket-ic manually and probe /instances
PORTFILE=$(mktemp)
"$PIC" --port-file "$PORTFILE" --ttl 60 --log-levels debug > /tmp/pic.log 2>&1 &
PICPID=$!
for i in $(seq 1 30); do
  if [ -s "$PORTFILE" ]; then break; fi
  sleep 0.2
done
PORT=$(cat "$PORTFILE")
echo "PORT=$PORT PID=$PICPID"
echo "=== pic.log ==="
cat /tmp/pic.log
echo "=== GET / ==="
curl -sS "http://127.0.0.1:$PORT/" | head -c 500; echo
echo "=== POST /instances empty ==="
curl -sS -D- -X POST "http://127.0.0.1:$PORT/instances" -H 'Content-Type: application/json' -d '{}' | head -c 2000; echo
echo "=== POST /instances with body from dfx style ==="
# Try common instance create payloads
curl -sS -D- -X POST "http://127.0.0.1:$PORT/instances" \
  -H 'Content-Type: application/json' \
  -d '{"subnet_config_set":{"nns":{"state_config":"New","instruction_config":"Production"},"application":[{"state_config":"New","instruction_config":"Production"}]}}' | head -c 2000; echo

kill -9 $PICPID 2>/dev/null || true
