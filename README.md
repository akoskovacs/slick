# Slick

A team chat: organizations, channels, threads, private chats, reactions and
bots. It is written in [Kex](https://github.com/kexhq/kex), on
[Metro](https://github.com/kexhq/metro) for the web and
[Harmat](https://github.com/kexhq/harmat) for the database. Pages are
rendered on the server and kept current over a WebSocket, so there is no
client-side application: the browser shows markup and sends events.

![Slick showing the #general channel of the Acme organization, with a thread open beside it](docs/screenshot.png)

*The development workspace `tey seed` makes, signed in as Ada.*

## What it does

- **Organizations.** Each has its own channels and people. Whoever creates
  one is its first member, and adds others by the email they registered with.
- **Channels and private chats.** A channel has a name and a topic and is
  open to everyone in its organization; a private chat is between two people,
  or one person and themselves: a space of their own for notes, which
  explains how to try Slick out.
  Every conversation has an address, which the address bar follows.
- **Threads.** Any message can be replied to beside the conversation.
- **Unread.** What came since somebody last looked is counted beside each
  channel and private chat, on other organizations in the rail, and in the
  page title. Only what is in front of them is read: a tab in the
  background, or a window behind another, leaves it unread. Starting or
  replying in a thread follows it, and other people's replies there count
  on its conversation until the thread is opened.
- **Files.** Drop files anywhere on a conversation, paste them, or pick them
  with 📎: they wait in the message box and go with the next message, with
  or without words. Pictures show in the message; everything sent into a
  conversation is in its **Files** tab, with previews of pictures and the
  start of text files. A file is only ever served to who may read where it
  was sent. They are kept by `Metro.Storage`, in `storage/` unless set.
- **Drafts.** What is written in a message box and not sent is saved as it
  is typed, on the server: it is there again after switching conversations,
  reloading, or on another device, and the sidebar marks where one is ✏️.
- **Reactions.** 👍 ❤️ 😂 🎉 👀 🙏 on a message; a second click takes yours off.
- **Rich text.** A light markup, read a line at a time (see below), and
  `:tada:`-style names for emoji; a message of nothing but emoji is shown
  big. Nothing typed is ever treated as HTML.
- **Presence.** Who has a tab open, who is typing, and a status of your own:
  an emoji and a few words.
- **Profiles.** A name or picture on a message opens that person's profile
  beside the conversation: their status, whether they are around, title,
  department, phone, time zone, a bio, and a way to write to them. A bot's
  says whose it is. Anyone can go by a nickname instead of their name.
  Details a directory sync takes over are locked: shown, not changed.
- **Live.** What one person does shows in everyone's open tabs at once.
- **Bots.** A bot is a member like any other, and uses Slick through a JSON
  API with a token.
- **Forms.** A message can carry a form — buttons to choose with, fields to
  fill in. An answer belongs to the form's message and is shown under it;
  it is not a message, and cannot be typed.
- **Accounts.** Registration and sign-in with hashed passwords and
  server-side sessions that last thirty days.

The search box in the top bar is not wired to anything yet.

## Run it

With Docker alone — no toolchain, no clone. The published image beside a
PostgreSQL; migrations run on start, data stays in a volume:

```sh
curl -O https://raw.githubusercontent.com/akoskovacs/slick/main/docker-compose.image.yml
POSTGRES_PASSWORD=choose-one docker compose -f docker-compose.image.yml up --detach
```

On http://localhost:4000: register, and create an organization of your
own. Newer images, stopping, logs and your own database are all under
Docker below.

## Develop it

With its sources, either Docker or a Kex 0.4.0-rc.2 toolchain or newer
(the migration uses fixes first released there; see
[the compatibility check](docs/kex-findings.md)). Harmat and Metro are
pinned by release tag in `package.kex`, to their commits in `tey.lock`:

```sh
git clone https://github.com/akoskovacs/slick && cd slick
docker compose up --build --detach   # needs only Docker
```

Or locally, with unixODBC and a SQLite ODBC driver too
(`brew install unixodbc sqliteodbc`):

```sh
sh script/setup.sh   # once: dependencies, the ODBC port program
tey seed             # once: the development workspace in the screenshot
tey server           # http://127.0.0.1:4000
```

Sign in as `admin@example.com`, `ada@example.com`, `bob@example.com` or
`eve@example.com` with the password `a better password` — or register, and
create an organization of your own. The seeded server administrator can
manage organizations across the server; Ada administers Acme.

| Command | |
| --- | --- |
| `tey server` | run pending migrations, then serve |
| `tey migrate` | run the migrations this database has not run |
| `tey rollback` | undo the newest migration; `tey rollback 3` undoes three |
| `tey seed` | migrate, then plant what the environment's database starts with |
| `tey db:create` | create the environment's SQLite database file |
| `tey db:drop` | drop the environment's SQLite database file |
| `tey console` | the application in Kex's REPL, its queries logged (`bin/console`) |
| `tey test` | the specs |
| `tey odbc` | build Erlang's ODBC port program into `db/odbc`, once |
| `tey dev` | the server, then the bot beside it — [slick-ai-bot](../slick-ai-bot) — once it answers; Ctrl-C stops all of them |

 `tey dev` (script/dev.sh) takes `HOST` and `PORT` as `tey server` does, and
 `BOT_OPERATORS`, the Slick ids of the people who may allow the bot's tools
 and choose what each conversation asks. The bot uses its development token
 — `tey seed` plants one — unless `BOT_TOKEN` says otherwise, and is skipped
 when its folder (`SLICK_BOT_DIR`) is not there.

The development seed creates `claude`, `muse`, and `opencode` identities.
`tey dev` starts one bot, using the `claude` identity; the other identities
need their own bot processes. Its default provider is Muse; for example,
`PROVIDERS=opencode tey dev` makes that bot use OpenCode instead.

To run the three identities separately alongside `tey server`, start each
command in its own terminal from `../slick-ai-bot`. Each bot needs its own
state file:

```sh
CLAUDE_TOKEN=slick_bot_development_claude SLICK_STATE=work/claude.json tey claude
MUSE_TOKEN=slick_bot_development_muse SLICK_STATE=work/muse.json tey muse
OPENCODE_TOKEN=slick_bot_development_opencode SLICK_STATE=work/opencode.json tey opencode
```

## Settings

| Variable | |
| --- | --- |
| `METRO_ENV` | `development` (the default), `test` or `production` |
| `PORT` | the port to listen on; 4000 unless set |
| `HOST` | the address to bind; 127.0.0.1 unless set |
| `DATABASE_DSN` | an ODBC connection string; when set, it is the database in every environment |
| `SQLITE_DRIVER` | the SQLite ODBC driver, when it is not where Homebrew puts it |
| `LOG_SQL` | `on` or `off`: whether each query is printed, highlighted and timed, as Rails does; on in development unless set |
| `NO_COLOR` | `1` prints queries without colors (Kex's own); they are plain anyway when the output is not a terminal |
| `METRO_STORAGE_ROOT` | the folder uploaded files are kept in; `storage` unless set (a volume in Docker) |

`tey db:create` and `tey db:drop` support SQLite: the default development or
test database, or a SQLite ODBC `DATABASE_DSN`. They refuse a database file
that is currently open by a process. PostgreSQL databases are managed by
PostgreSQL and are not affected by these commands.

## Writing a message

| Typed | Shown as |
| --- | --- |
| `# Release notes` | a heading |
| `- one` | a list item, for as many lines as start that way |
| `> as she said` | a quote |
| three backticks on a line of their own | code, up to the closing three |
| `---` | a divider |
| `*bold*` `_italic_` `~struck~` `` `code` `` | inside a line |
| `:rocket:` | 🚀 |
| a message of nothing but emoji | shown big |
| `https://…` | a link |
| `[?] Notes` | a form field to type in |
| `[?] Deploy to: staging \| production` | a form field to choose in |

Enter sends; Shift+Enter starts a new line.

### Forms

A message can ask something back, which is how a bot gets an answer without
anybody typing it out. Field lines one under the other are one form:

```
Before I deploy:
[?] Environment: staging | production
[?] Release notes
```

A form that is a single choice is shown as a button for each option, and
one click answers it. Anything more is shown as fields with a Send button.

An answer is not a message. It is kept with the message that asked, shown
under the form — who answered, and what — and can only be given by using the
form: typing `Environment: staging` is just saying it, and an option that
was not offered is not an answer. A person has one answer to a form, and
answering again replaces it. A bot is told the answers to the forms in its
own messages, and to no others, so what it reads there is what somebody
really chose in a form it really asked.

## Bots and the API

A bot is made in the **Bots** dialog (the gear beside Bots in the sidebar):
it belongs to the organization or to you, and its token is shown once. The
same dialog gives a bot a new token (the old one stops working) and removes
it, which takes its access with it. Every request carries the token:

```sh
curl -H "Authorization: Bearer slick_bot_…" http://127.0.0.1:4000/api/me
```

| | |
| --- | --- |
| `GET /api/me` | the bot, and the organizations it is in |
| `GET /api/events?after=<cursor>` | a WebSocket: what the bot may see happening — a message, a form answered, a command used — told as it happens, each with a cursor; `?token=` carries the bot's token |
| `GET /api/:organization/channels` | the organization's channels |
| `GET /api/:organization/channels/:name/messages` | the newest messages, oldest first; `?limit=`, `?after=<sentAt>` |
| `GET /api/:organization/channels/:name/messages?thread=<id>` | one thread: the message and its replies |
| `POST /api/:organization/channels/:name/messages` | say something: `{"body": "…"}`, with `"thread": "<id>"` to reply |
| `POST /api/:organization/channels/:name/reactions` | `{"message": "<id>", "emoji": "🎉"}` |
| `POST /api/:organization/channels/:name/status` | what the bot is doing: `{"text": "Thinking", "seconds": 30}` |
| `GET /api/:organization/dm` | the private chats the bot has |
| `GET /api/:organization/answers?after=<answeredAt>` | the answers to the forms in the bot's own messages: where, who, what |
| `GET`, `POST /api/:organization/dm/:person/…` | the same as for a channel, in the private chat with a person |

A message can also be sent as blocks (`{"blocks": [{"type": "heading",
"text": "…"}, …]}`), and every message read back carries both its `body` and
its `blocks`. A form is a block too: `{"type": "form", "fields": [{"label":
"Environment", "options": ["staging", "production"]}, {"label": "Release
notes"}]}`. The whole of it is described at the top of
`app/controllers/api.kex`.

`tey seed` makes a development bot called `claude`, with token
`slick_bot_development_claude`. The separate [slick-ai-bot](../slick-ai-bot)
project is the bot: it answers when named in a channel or written to in
private, with Muse, OpenCode or Claude, chosen per conversation; see its
README for setup.

## Database

| `METRO_ENV` | Database |
| --- | --- |
| `development` (default) | SQLite, `db/development.sqlite3` |
| `test` | SQLite, `db/test.sqlite3` |
| `production` | whatever `DATABASE_DSN` names |

```sh
tey migrate
tey rollback
tey seed       # development: admin@example.com plus Acme and its demo users
```

Seeds are apart from the migrations (`db/seeds.kex`), and planting them
twice plants once. Only development has any.

## Docker

### The published image

CI publishes Slick as `ghcr.io/akoskovacs/slick`: `latest` is the newest
main, `sha-…` one commit of it, and a release tagged `v1.2.3` is `1.2.3` and
`1.2`. It comes for amd64 and arm64. The quickstart is under Run it above;
here is everything around it.

```sh
docker compose -f docker-compose.image.yml pull              # a newer image…
docker compose -f docker-compose.image.yml up --detach       # …and onto it
docker compose -f docker-compose.image.yml logs --follow app
docker compose -f docker-compose.image.yml run --rm app rollback
docker compose -f docker-compose.image.yml down              # stop; the data stays
```

| Variable | |
| --- | --- |
| `POSTGRES_PASSWORD` | the database's password; required |
| `SLICK_IMAGE` | the image; `ghcr.io/akoskovacs/slick:latest` unless set. Name a version to stay on it |
| `PORT` | the port Slick is reached on; 4000 unless set |

The image is public: no sign-in needed to pull it.

Against a database of your own, the image needs only where it is — an ODBC
connection string. The PostgreSQL driver in the image is called
`PostgreSQL Unicode`:

```sh
docker run --detach --publish 4000:4000 \
  --env DATABASE_DSN="Driver={PostgreSQL Unicode};Server=db.example.com;Port=5432;Database=slick;Uid=slick;Pwd=…" \
  ghcr.io/akoskovacs/slick:latest
```

Slick speaks plain HTTP on port 4000. Put it behind something that
terminates TLS, and have that pass `X-Forwarded-Proto: https`, so that the
session cookie is marked `Secure`.

### On TrueNAS SCALE

`docker-compose.truenas.yml` is the same pair as a Custom App (24.04 or
newer), aimed at this NAS: the database lives in a Docker volume
(the same setup as the other postgres apps here), uploads go to
`/mnt/vault/Vault/Etc/Slick/storage`, the password goes in the file,
the image is pinned to the `0.1` release, and Slick answers on 30900.
Paste it
into Apps → Discover Apps → ⋮ → Install via YAML, open
`http://<nas>:30900`, register, and create an organization. To
upgrade, change the tag and redeploy; the folders keep the data.

### Building it yourself

```sh
docker compose up --build    # http://localhost:4000, on PostgreSQL
```

`docker-compose.yml` runs the application beside a PostgreSQL 17 and keeps
the data in a volume; `Dockerfile` is the application on the Kex toolchain
image, with the ODBC drivers it reaches a database through.

| Variable | |
| --- | --- |
| `POSTGRES_PASSWORD` | the database's password; set it anywhere but your own machine |
| `KEX_IMAGE` | the Kex toolchain image to build on; `ghcr.io/kexhq/kex:0.4.0-rc.2` unless set |
| `GITHUB_TOKEN` | fetches dependencies kept in private repositories, at build time only |

## CI

`.github/workflows/ci.yml` builds Slick and runs its specs in the Kex
toolchain image, then builds the Docker image, starts it beside PostgreSQL
and uses it from outside with `script/smoke.sh` — before and after a
restart, so that what was stored is seen to be still there. When both pass
on main, or on a tag like `v1.2.3`, it publishes the image.

A tag also makes a GitHub release: its notes name the published image
tags, the Kex toolchain, and the Harmat and Metro releases the build
resolved. To cut one:

```sh
git tag -a v0.1.0 -m "Slick 0.1.0" && git push origin v0.1.0
```

```sh
script/smoke.sh http://localhost:4000   # against any running Slick
```

## Layout

```
main.kex            boot, and the server / migrate / rollback / seed commands
app/
  models/           records, no database code
  forms/            what a form's fields must satisfy
  services/         authentication: register, sign in, sign out
  live/             pages kept live over a WebSocket; a tab's state
  views/            view code and the .ket templates beside it
config/
  database.kex      environment -> connection string
  routes.kex        every URL, and who may reach it
db/
  schema/           tables, declared
  migrate/          one numbered migration per file
  migrations.kex    the list of them, in order
  repositories/     the only code that knows rows
  store.kex         the process that owns the connection
  seeds.kex         what a new database starts with, per environment
public/             app.css
script/             setup, and smoke.sh: a running Slick checked from outside
spec/
```
