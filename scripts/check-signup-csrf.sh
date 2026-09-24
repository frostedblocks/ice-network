#!/bin/bash
CODE=$(curl -sS -o /tmp/s.json -w "%{http_code}" -X POST \
  -H "Origin: https://evil.example" \
  -H "Content-Type: application/json" \
  --data-binary '{"login":"a@b.com","password":"Password123!"}' \
  https://lite.frostedblocks.com/api/auth/signup)
echo "evil_origin_code=$CODE"
cat /tmp/s.json; echo
CODE2=$(curl -sS -o /tmp/s2.json -w "%{http_code}" -X POST \
  -H "Origin: https://lite.frostedblocks.com" \
  -H "Content-Type: application/json" \
  --data-binary '{"login":"a@b.com","password":"Password123!"}' \
  https://lite.frostedblocks.com/api/auth/signup)
echo "lite_origin_code=$CODE2"
cat /tmp/s2.json; echo
