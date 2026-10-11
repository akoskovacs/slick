#!/bin/sh
# Checks a running Slick from outside, the way a browser and a bot would
# meet it: pages answer, nobody is let in unasked, an account can be made
# and signed in to.
#
#   script/smoke.sh                          against http://localhost:4000
#   script/smoke.sh http://localhost:4000    registers somebody, signs them in,
#                                            and prints their email
#   script/smoke.sh http://localhost:4000 somebody@example.com
#                                            signs in somebody an earlier run
#                                            registered: what was stored is
#                                            still there
set -eu

base="${1:-http://localhost:4000}"
email="${2:-}"
password="a long smoke phrase"

status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

expect() {
  wanted="$1"; what="$2"; shift 2
  got="$(status "$@")"
  [ "$got" = "$wanted" ] || { echo "smoke: $what answered $got, not $wanted" >&2; exit 1; }
}

# Up to two minutes for the application to migrate and start listening.
tries=0
until [ "$(status "$base/signin")" = 200 ]; do
  tries=$((tries + 1))
  [ "$tries" -lt 60 ] || { echo "smoke: $base/signin never answered" >&2; exit 1; }
  sleep 2
done

expect 303 "the home page, to nobody" "$base/"
expect 200 "the stylesheet" "$base/app.css"
expect 401 "the API, without a token" "$base/api/me"

if [ -z "$email" ]; then
  email="smoke-$(date +%s)@example.com"
  expect 303 "registering" -H "Origin: $base" \
    --data-urlencode "name=Smoke" --data-urlencode "email=$email" --data-urlencode "password=$password" \
    "$base/register"
fi

expect 303 "signing in" -H "Origin: $base" \
  --data-urlencode "email=$email" --data-urlencode "password=$password" \
  "$base/signin"
expect 422 "signing in with the wrong password" -H "Origin: $base" \
  --data-urlencode "email=$email" --data-urlencode "password=not the password" \
  "$base/signin"

echo "$email"
