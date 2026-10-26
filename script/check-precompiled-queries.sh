#!/bin/sh
# Verify fixed SELECT, INSERT, UPDATE and DELETE shapes, including runtime values.
# Use the Kex compiler and Harmat/Metro sources being developed together:
#   KEX=/path/to/kex HARMAT_ROOT=../harmat METRO_ROOT=../metro sh script/check-precompiled-queries.sh
set -eu

repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
kex=${KEX:-kex}
harmat=${HARMAT_ROOT:-$repo/../harmat}
metro=${METRO_ROOT:-$repo/../metro}
work=$(mktemp -d "${TMPDIR:-/tmp}/slick-precompiled.XXXXXX")
trap 'rm -rf "$work"' EXIT HUP INT TERM
mkdir "$work/core"

"$kex" -E --collapse-report --no-colors \
  --source-root "$repo" \
  --source-root "$harmat/src" \
  --source-root "$metro/src" \
  -o "$work/core" "$repo/db/repositories/sessions.kex" \
  > "$work/build.log" 2>&1 || {
  cat "$work/build.log"
  exit 1
}

core="$work/core/Kex.DB.Repositories.Sessions.core"
[ -s "$core" ] || { echo 'session repository Core Erlang was not emitted' >&2; exit 1; }
for query in holder revoke; do
  awk -v query_name="$query" '
    $0 == "\047" query_name "\047/2 =" { active = 1; next }
    active && /^\047[^\047]+\047\/[0-9]+ =$/ { exit }
    active { print }
  ' "$core" > "$work/$query.core"
  [ -s "$work/$query.core" ] || { echo "$query function was not emitted" >&2; exit 1; }
  if rg -n "call 'Kex.Harmat.Database':'(select|from|delete|where|prepared|preparedDelete|statement)'" "$work/$query.core"; then
    echo "$query still builds SQL at runtime" >&2
    exit 1
  fi
  if ! rg -q 'TokenDigest' "$work/$query.core"; then
    echo "$query lost its runtime digest parameter" >&2
    exit 1
  fi
done
if ! rg -q "'Harmat.Odbc.Statement'.*#<68>.*#<69>.*#<76>.*#<69>.*#<84>.*#<69>" "$work/revoke.core"; then
  echo 'revocation lacks a precompiled DELETE statement' >&2
  exit 1
fi
if ! rg -q 'sessions.kex:.*collapsed' "$work/build.log"; then
  echo 'no session query expression collapsed' >&2
  exit 1
fi
awk '
  /^\047admit\047\/4 =$/ { active = 1; next }
  active && /^\047[^\047]+\047\/[0-9]+ =$/ { exit }
  active { print }
' "$core" > "$work/admit.core"
if ! rg -q "'Harmat.Odbc.Statement'" "$work/admit.core" ||
   ! rg -q "'created_at', CreatedAt" "$work/admit.core"; then
  echo 'session insert lacks precompiled SQL or its runtime values' >&2
  exit 1
fi
if rg -n "call 'Kex.Harmat.Database':'(insert|values|preparedInsert|statement)'" "$work/admit.core"; then
  echo 'session insert still builds SQL at runtime' >&2
  exit 1
fi

"$kex" -E --collapse-report --no-colors \
  --source-root "$repo" \
  --source-root "$harmat/src" \
  --source-root "$metro/src" \
  -o "$work/core" "$repo/db/repositories/messages.kex" \
  > "$work/messages-build.log" 2>&1 || {
  cat "$work/messages-build.log"
  exit 1
}
core="$work/core/Kex.DB.Repositories.Messages.core"
[ -s "$core" ] || { echo 'message repository Core Erlang was not emitted' >&2; exit 1; }
awk '
  /^\047replies\047\/2 =$/ { active = 1; next }
  active && /^\047[^\047]+\047\/[0-9]+ =$/ { exit }
  active { print }
' "$core" > "$work/replies.core"
[ -s "$work/replies.core" ] || { echo 'replies function was not emitted' >&2; exit 1; }
if rg -n "call 'Kex.Harmat.Database':'(select|from|where|orderBy|prepared|statement)'" "$work/replies.core"; then
  echo 'message lookup still builds SQL at runtime' >&2
  exit 1
fi
if ! rg -q "'Harmat.Odbc.Statement'" "$work/replies.core" || ! rg -q '\[RootId\]' "$work/replies.core"; then
  echo 'message lookup lacks precompiled SQL or its runtime parameter' >&2
  exit 1
fi
awk '
  /^\047newerCount\047\/3 =$/ { active = 1; next }
  active && /^\047[^\047]+\047\/[0-9]+ =$/ { exit }
  active { print }
' "$core" > "$work/newer-count.core"
if ! rg -q '\[ConversationId, #\{\}#, After\]' "$work/newer-count.core" ||
   ! rg -q "'Harmat.Odbc.Statement'" "$work/newer-count.core"; then
  echo 'mixed text and integer query parameters were not precompiled' >&2
  exit 1
fi
if rg -n "call 'Kex.Harmat.Database':'(select|from|where|prepared|statement)'" "$work/newer-count.core"; then
  echo 'mixed-parameter count still builds SQL at runtime' >&2
  exit 1
fi

"$kex" -E --collapse-report --no-colors \
  --source-root "$repo" \
  --source-root "$harmat/src" \
  --source-root "$metro/src" \
  -o "$work/core" "$repo/db/repositories/teams.kex" \
  > "$work/teams-build.log" 2>&1 || {
  cat "$work/teams-build.log"
  exit 1
}
core="$work/core/Kex.DB.Repositories.Teams.core"
awk '
  /^\047markManaged\047\/3 =$/ { active = 1; next }
  active && /^\047[^\047]+\047\/[0-9]+ =$/ { exit }
  active { print }
' "$core" > "$work/mark-managed.core"
if ! rg -q "'Harmat.Odbc.Statement'" "$work/mark-managed.core" ||
   ! rg -q 'ExternalId' "$work/mark-managed.core" ||
   ! rg -q '\[#\{\}#, Id\]' "$work/mark-managed.core"; then
  echo 'team update lacks precompiled SQL or runtime parameters' >&2
  exit 1
fi
if rg -n "call 'Kex.Harmat.Database':'(update|set|where|preparedUpdate|statement)'" "$work/mark-managed.core"; then
  echo 'team update still builds SQL at runtime' >&2
  exit 1
fi
printf '%s\n' 'Slick SELECT, INSERT, UPDATE and DELETE shapes compile with runtime parameters.'
