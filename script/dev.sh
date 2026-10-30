#!/bin/sh
# Slick in development, with its bot: the server, then the one bot that
# asks whichever AI it is told to, once the server answers. Ctrl-C stops
# all of them.
#
#   tey dev
#   HOST=0.0.0.0 PORT=4001 BOT_OPERATORS=u1791… tey dev
#
# The server prints as `tey server` does, its queries in color. The bot's
# lines start with its name. When its folder is not there it is skipped.
#
#   HOST, PORT          where the server listens, as for `tey server`
#   BOT_OPERATORS       the Slick ids of the people who may allow the bot's
#                       tools, and choose what each conversation asks; none
#                       unless set
#   SLICK_BOT_DIR       the bot; ../slick-ai-bot unless set
#   BOT_TOKEN           the bot's token; the development `claude` bot's
#                       unless set (the one `tey db:seed` plants)
#
# The development token is one a development database's bot is given;
# another database's bot needs its own, from the Bots dialog.
set -eu
cd "$(dirname "$0")/.."

port="${PORT:-4000}"
url="http://127.0.0.1:${port}"
bot_dir="${SLICK_BOT_DIR:-../slick-ai-bot}"
operators="${BOT_OPERATORS:-}"

# Stopping takes down everything started here, and everything under it:
# `tey` runs each program in a process group of its own, so neither Ctrl-C
# nor a signal to this script's group reaches them by itself.
children=""
ended() {
  for child in $(pgrep -P "$1"); do ended "$child"; done
  kill "$1" 2>/dev/null || true
}
stop() {
  trap - INT TERM EXIT
  for pid in $children; do ended "$pid"; done
  exit 0
}
trap stop INT TERM EXIT

# The server writes straight to the terminal, so its colors stay.
tey server &
children="$children $!"

printf 'Waiting for Slick on %s…\n' "$url"
until curl -s -o /dev/null "$url/signin"; do
  kill -0 "${children# }" 2>/dev/null || { echo "Slick stopped before it answered."; exit 1; }
  sleep 1
done

# `tey run` in the bot's folder, its lines prefixed with its name.
bot() {
  name="$1"; dir="$2"; shift 2
  if [ ! -d "$dir" ]; then
    printf '%s: no %s, so not started\n' "$name" "$dir"
    return
  fi
  (cd "$dir" && env SLICK_URL="$url" "$@" tey run all 2>&1 | awk -v name="$name" '{ print "[" name "] " $0; fflush() }') &
  children="$children $!"
}

bot slick-ai "$bot_dir" \
  SLICK_TOKEN="${BOT_TOKEN:-slick_bot_development_claude}" \
  SLICK_OPERATORS="${SLICK_OPERATORS:-$operators}"

wait
