#!/bin/sh
# Slick in development, with its bots: the server, then muse and opencode
# once it answers. Ctrl-C stops all of them.
#
#   tey dev
#   HOST=0.0.0.0 PORT=4001 BOT_OPERATORS=u1791… tey dev
#
# The server prints as `tey server` does, its queries in color. Each bot's
# lines start with its name. A bot whose folder is not there is skipped.
#
#   HOST, PORT          where the server listens, as for `tey server`
#   BOT_OPERATORS       the Slick ids of the people who may allow a bot's
#                       tools, and choose opencode's model; none unless set
#   MUSE_BOT_DIR        muse-bot; ../muse-bot unless set
#   OPENCODE_BOT_DIR    opencode-bot; ../opencode-bot unless set
#   MUSE_TOKEN          muse's token; slick_bot_development_muse unless set
#   OPENCODE_TOKEN      opencode's; slick_bot_development_opencode unless set
#
# The development tokens are the ones a development database's bots are
# given; another database's bots need their own, from the Bots dialog.
set -eu
cd "$(dirname "$0")/.."

port="${PORT:-4000}"
url="http://127.0.0.1:${port}"
muse_dir="${MUSE_BOT_DIR:-../muse-bot}"
opencode_dir="${OPENCODE_BOT_DIR:-../opencode-bot}"
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

# `tey run` in a bot's folder, its lines prefixed with its name.
bot() {
  name="$1"; dir="$2"; shift 2
  if [ ! -d "$dir" ]; then
    printf '%s: no %s, so not started\n' "$name" "$dir"
    return
  fi
  (cd "$dir" && env SLICK_URL="$url" "$@" tey run 2>&1 | awk -v name="$name" '{ print "[" name "] " $0; fflush() }') &
  children="$children $!"
}

bot muse "$muse_dir" \
  SLICK_TOKEN="${MUSE_TOKEN:-slick_bot_development_muse}" \
  MUSE_OPERATORS="${MUSE_OPERATORS:-$operators}"
bot opencode "$opencode_dir" \
  SLICK_TOKEN="${OPENCODE_TOKEN:-slick_bot_development_opencode}" \
  OPENCODE_OPERATORS="${OPENCODE_OPERATORS:-$operators}"

wait
