# AI conversations in Slick: issues found

Status: all fixed, not yet committed; ids are left as they are (8).

What stood between Slick and holding real AI conversations through
[slick-ai-bot](../../slick-ai-bot), found on 2026-10-21 by using it: the
`claude` bot (`tey all`, so Muse answering by default) in `#test-channel`
(bots read *all*), `#test-kex-work`, and a private chat.

Each issue says what was seen, why it happens, and where it is fixed.

## 1. A refused command is acted on again

**Seen.** Ada (not an operator) used `/adopt <id>` and was refused. When
Akos used the same command two minutes later, the bot first refused
*Ada's* command again, then took Akos's.

**Why.** Everything the bot knows lives in its memory only: how far it has
read the commands (`invokedAt`) and the form answers (`answeredAt`), the
sessions, modes, models and allowed tools of every conversation. Started
again, it begins from nothing. Its first look is meant to take note of
what is already there without acting on it, but when any part of that
look fails it still counts as having looked (`primed?`). The next command
then fetches every command since 0, and the old ones are acted on again.

**Fix (bot).** The bot keeps what it knows in a file
(`SLICK_STATE`, `work/state.json` unless set; `SlickAI.State`) and reads it
back on start. Commands are acted on once by id (`handled`, the newest
200), whatever the cursor says. A first look that failed anywhere
(`faults`) is not a first look: it is taken again, on the next telling.

## 2. A restart forgets every session

**Seen.** Follows from 1: after a restart an adopted session, a chosen
AI or model, a `/mode`, and the tools an operator allowed are all gone.
A conversation silently starts a fresh session.

**Why / fix.** As 1: the state file keeps them.

## 3. The bot answers itself

**Seen.** In the private chat the bot posted answers 9 minutes after the
last thing Akos said, each one repeating what it had already said.

**Why.** The Muse session log shows the prompt it was given ended with
the bot's *own* messages, then "Answer the newest message". A private
chat is answered when it has a person's message the bot has not seen; a
bot that forgot what it had seen (1) finds them all unseen and answers,
although it had answered them long before.

**Fix (bot).** With 1 fixed, a restarted bot no longer finds old
messages unseen. And when what it is to answer was said *before* its own
newest message — written while it was answering — the AI is told so, and
to answer only what is still unanswered, or "no reply". It no longer reads
its own words as the newest thing said.

## 4. Muse's steps run together: "no replyI'm Muse Code…"

**Seen.** Answers starting with `no reply` glued to more text, and the
silent answer (`no reply`) not keeping the bot silent.

**Why.** `muse exec` prints the text of every model step of a run, one
after another without a break. The bot took all of it as the answer, so
an answer that was first "no reply" and then something else was both.

**Fix (bot).** Muse is run with `--json`, and the answer is the text of
its final event (`run.terminal.completed`) only. Silence is also
recognised when the answer *starts* with "no reply" on a line of its own.

## 5. In a channel that bots read whole, every message gets a thread

**Seen.** In `#test-channel` (*all*), Ada wrote five short messages; the
bot answered three of them, each in its own thread. Ada: "it would be
better to just reply in the channel".

**Why.** The bot answers every message in a channel in that message's
thread, the way a bot that is named (*mentions*) has to: that is all it
may read there. A channel it reads whole is a conversation of its own,
as the README says, and is not answered that way.

**Fix (Slick + bot).** Slick's events say the conversation's bot access
(`"access"`). In a channel or group chat with *all*, a message said in
the channel is answered in the channel, with its newest messages as the
conversation; replies in a thread are still answered in the thread. With
*mentions*, as before. A burst of messages is answered once: by the time
the bot comes to the second, it has answered with all of them in view.
When the bot cannot be told and looks instead (no `/api/events`), it does
not know a channel's access, and answers in threads as before.

## 6. Operators can only be set in the bot's environment

**Seen.** The Bots dialog has no way to choose who may allow a tool or
use `/model`, `/mode` and `/adopt`; it is `SLICK_OPERATORS` on the
machine the bot runs on, and the refusal message shows a raw id.

**Fix (Slick + bot).** Slick keeps a bot's operators (`bot_operators`,
begun before this) and shows them in the Bots dialog under each bot
(*Operators (n)*), where the bot's owner or an admin chooses them. `/api/me` says them, and the bot takes
them from there, and again on every full look, so a change reaches a
running bot. `SLICK_OPERATORS` still works, for a Slick that does not say.

## 7. The bot called @claude answers as Muse

**Seen.** "I'm Muse Code powered by Meta Muse Spark… I just show up as
@claude".

**Why.** `tey all` makes Muse the usual AI whatever the bot is called,
and `PROVIDERS` only chose which AIs there are.

**Fix (bot).** The first AI `PROVIDERS` names is now the usual one:
`PROVIDERS=claude,muse,opencode` for this bot. With `PROVIDERS` unset it
is still Muse. `/model claude` chooses per conversation, as before.

## 8. Schema: text where there could be numbers

**Seen.** Most columns are `text`: every id, `created_at` in five tables,
`granted_at`, flags such as `teams.managed` and `users.show_nickname`, and
`sent_on`, `invoked_on`, `uploaded_on` beside the `bigint` moments.

**Fix (Slick), migration `count_moments`.**

- `created_at` (users, sessions, organizations, conversations, teams) and
  `grants.granted_at` are `bigint` milliseconds, like `sent_at`. The
  migration converts each ISO value where it is, in SQL that SQLite and
  PostgreSQL both run (`DB.Migrate.Moments`, after Hinnant's calendar
  arithmetic), then changes the column type. A rollback writes them back
  as UTC text, to the millisecond. Checked against Python's own date
  parsing on a copy of the development database (73 rows) and on a fresh
  PostgreSQL 17, both ways: offsets, a leap day, short fractions, "".
- `sent_on`, `invoked_on`, `uploaded_on` are gone. They repeated the
  moment as text in the server's time. Times are now shown from the number:
  the page writes UTC, and the `Moment` hook (`public/app.js`) shows it in
  the viewer's own time zone, which is right across DST too. The bot API
  still says `sentOn`, now in UTC.
- `users.show_nickname` ("yes"/"") is the boolean `nickname_shown`, the
  field's own name, so the column renaming in `DB.Repositories.Users` is
  gone. `teams.managed` is gone: it only ever said whether the team has an
  `external_id`, and `managed?` is worked out from that now.
- `users.managed` stays text: it is not a flag but the list of profile
  fields a sync keeps.

**Not changed.** Ids (`m<ms>-<serial>`, `u<µs>-<n>`) are text primary
keys, ~20 bytes against 8 for a `bigint`. On Postgres that makes indexes
about twice the size, which is felt only at many millions of rows. They
are made without the database, which keeps inserts and the bots' API
simple, and they sort by time. Serials would need ids to come back from
inserts, and would make ids guessable. Worth it only together with a
Postgres-first schema.
