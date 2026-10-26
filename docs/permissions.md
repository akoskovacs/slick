# Permissions

A single permission system for Slick: server admins, organization admins,
channel admins, read-only users, and bots — with teams (and, later, SCIM
groups) as first-class permission entities.

This document describes the model before any of it is built. Nothing here is
implemented yet.

## Where Slick is now

There are no roles today. Access is implicit and flat:

- **Membership** (`memberships`) — a user in an organization is a full
  member: they can create channels, invite people, and manage the
  organization's bots. Everyone is an admin.
- **Channel access** (`conversations.access`, `participants`) — a channel is
  public (any organization member) or private (only its participants, plus
  the members of the team that owns it).
- **Teams** (`teams`, `team_members`) — a named set of people; a team can own
  a channel (`conversations.team_id`), which is how private channels know who
  else may read them.
- **Bots** — a bot belongs to a person or an organization
  (`users.owner_id` / `users.owner_organization_id`); otherwise it is an
  ordinary member.

The same two checks decide almost everything today:

- `App.Live.Chat.home(user, tab)` — which organization a user is in.
- `Conversation.admits?(userId)` — who may read a conversation.

Both are replaced by the system below.

## The model

One table expresses every "who may do what where":

```
grant(subject, resource, role)

  subject    = user_subject | team_subject
  resource   = server_resource | organization_resource | conversation_resource | team_resource
  role       = admin | member | read_only
```

A **user** is a person or a bot (`users.kind`). A **team** is a group of
users; because a team is a subject, one grant can hand a whole team a role —
a team owns a channel, a team is admitted to a private channel — and its
members inherit it. This is what makes SCIM groups drop in later with no new
concept.

A **conversation** covers channels and group chats; a private chat between
two people is implicit (the two of them, and nobody else).

### Schema

```kex
# db/schema/grants.kex
Table.define :grants do |t|
  t.text(:id, primaryKey: true)          # "<subject-type>:<subject-id>:<resource-type>:<resource-id>"
  t.text(:subject_type, oneOf: Harmat.Column.choices(Type.of(Grant.UserSubject)))
  t.text(:subject_id)
  t.text(:resource_type, oneOf: Harmat.Column.choices(Type.of(Grant.ServerResource)))
  t.text(:resource_id, default: "")      # "" for a server grant
  t.text(:role, oneOf: Harmat.Column.choices(Type.of(Grant.Admin)))
  t.text(:granted_at)
end
# indexes on subject_id, on (resource_type, resource_id), and on the pair
```

Examples:

| Grant | Meaning |
| --- | --- |
| `grant(alice, server, admin)` | Alice is a server admin |
| `grant(alice, organization:acme, member)` | Alice is an Acme member |
| `grant(alice, organization:acme, read-only)` | Alice reads Acme, writes nothing |
| `grant(alice, conversation:#random, member)` | Alice is in the private channel |
| `grant(@design, conversation:#brand, admin)` | the @design team owns #brand |
| `grant(alice, team:@design, member)` | Alice is in @design |

## Roles and what they allow

Role resolution is per resource, highest wins. A team grant contributes the
team's role to every member. A server admin bypasses every check.

```
effective-role(user, resource) =
  max role among:
    grant(user, resource, …)
    grant(team, resource, …) for each team the user is in
    (an organization's own grant, for a conversation of that organization)
```

The matrix (read = "the highest role that allows the action"):

| Action | Server admin | Org admin | Org member | Org read-only | Conversation admin | Conversation member | Conversation read-only |
| --- | --- | --- | --- | --- | --- | --- | --- |
| read a public conversation | ✓ | ✓ | ✓ | ✓ | — | — | — |
| read a private conversation | ✓ | ✓ if member | ✓ if member | ✓ if member | ✓ | ✓ | ✓ |
| write a conversation | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ |
| create a channel | ✓ | ✓ | ✓ | ✗ | — | — | — |
| manage a conversation (topic, members, bot access, delete) | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ |
| create a team | ✓ | ✓ | ✓ | ✗ | — | — | — |
| manage a team (members, name) | ✓ | ✓ | ✗ | ✗ | — | — | — |
| manage the organization (invite, bots, teams, channels) | ✓ | ✓ | ✗ | ✗ | — | — | — |
| create an organization | ✓ | ✓ | ✓ | — | — | — | — |
| manage the server (organizations, users) | ✓ | ✗ | ✗ | ✗ | — | — | — |

Notes and deliberate choices:

- **"manage a conversation"** and **"manage the organization"** are the two
  new powers. Today any member has both; after this, only admins do.
- **Read-only** means exactly that — read, never write — at whatever scope
  it is granted. A channel-level `read-only` grant overrides an org-level
  `member` for that channel.
- The organization's **creator becomes its admin** (first grant). Admins can
  grant and revoke admin. (An "owner" that cannot be demoted is Slack's
  concept; not in the first cut.)
- **Teams keep a `members` view** (their member grants) for mentioning
  `@team`; their power comes only from the grants *they* hold.

### Where authorization lives

Authorization follows the model it describes. `User` exposes `canRead?`,
`canWrite?`, `canCreate?`, `canManage?`, `canAdminister?`, and
`serverAdmin?` in its `make` block. `User.role` resolves a person's effective
role, while `Grant.roleFor` combines direct and team grants. Organization
membership and organization role lookup live in `Organization`'s `make` block.

## Bots

A bot is a user (`kind: "bot"`). Its grants work exactly like a person's.
Two additions apply only to bots:

- **Channel read-scope** — a property of a conversation,
  `bot_access ∈ no_bots | mentions | all_bots`, set by whoever may manage the
  conversation:

  - `no_bots` — bots do not read or hear about this conversation at all.
  - `mentions` — a bot reads only threads it was mentioned in, threads it has
    replied in, and its own private chats (the safe default).
  - `all_bots` — a bot reads everything it is otherwise allowed to, and takes part
    naturally (no `@mention` required).

  A bot's effective ability is the intersection of its grants and this
  setting. Enforcement is in the message API (`history`) and the events
  stream (`App.Live.Events`), not only in the bot.

- **Per-conversation session & adoption** — each bot keeps one session per
  conversation (the channel is the unit of work, not its threads), and an
  operator can `/adopt <session>` a CLI session into the channel. Several
  bots — different providers — can share a channel for a second opinion, each
  with its own session.

This is why the bot features were being folded in: they are permissions, not
special cases.

## SCIM, later

A SCIM **Group** maps to a team. Provisioning writes into the same table:

- group members → `grant(user, team:<group>, member)`
- a group assigned to a channel → `grant(team:<group>, conversation:<channel>, member|admin)`

`Team.external_id` already marks a team a sync brought in and locks its name
and members; that stays.

## Migration

The three membership tables collapse into `grants`, and channel ownership
becomes a grant:

| From | To |
| --- | --- |
| `memberships` (org, user) | `grant(user, organization:<org>, member)` |
| `participants` (conversation, user) | `grant(user, conversation:<id>, member)` |
| `team_members` (team, user) | `grant(user, team:<team>, member)` |
| `conversations.team_id` (team owns channel) | `grant(team:<team>, conversation:<id>, admin)` |
| (new) | the organization's creator → `grant(user, organization:<org>, admin)` |

The old tables and `conversations.team_id` are dropped once reads go through
grants. The migration copies existing rows and seeds each organization's
creator as its admin (so nobody loses anything).

## Enforcement points

How the model permissions are used:

- `User.visible` / `home` — reading, and most write events route through
  `User.canRead?` and `User.canWrite?`.
- `User.botMayRead?` applies the conversation's bot read-scope.
- `User.manageableBots` includes organization bots only when the person may
  manage that organization, plus their own bots.
- Channel, invite, bot, and team operations use the corresponding `User`
  authorization functions.
- `App.Controllers.Api.history` + `App.Live.Events` — the bot read-scope.

## Phases

1. Schema + migration (grants table, copy data, drop old tables, seed org
   admin).
2. Role resolution (including team transitivity) and permission checks in
   their `User`, `Organization`, and `Grant` model blocks.
3. Rewire the existing checks to those model functions; keep behaviour
   identical (flat membership → member role, so nothing visibly changes yet).
4. Roles in the UI: server admin, org admin, channel admin, read-only, and
   the role chooser on invite.
5. Channel bot read-scope (`none`/`mentions`/`all`) + API/events enforcement.
6. Bot: honor the scope; natural participation in `all`; per-channel sessions
   and `/adopt`; multiple providers per channel.

Phases 1–3 change nothing a user can see; 4–6 add the new powers on top.

## Open questions

- Does "member" also allow *creating* private channels? (Here: yes, same as
  today.)
- Should an org have a distinct "owner" that cannot be demoted, or is
  "admin" enough for now? (Here: admin only.)
- Harmat's migration DSL: confirm it can copy rows between tables (a
  transform step), or the copy runs as a one-off script.
