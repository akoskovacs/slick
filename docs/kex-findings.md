# Kex findings from Slick, Metro and Harmat

Bugs and limits met while building Slick on Kex 0.4.0-rc.1, on the BEAM.
Rechecked on Kex main at 286c026 and filed on milestone 0.4.0, except where
an entry says otherwise; rechecked again on `3111d30`, and each entry below
carries its status there. At the end: names in the code that were chosen
only to avoid these, to rename once they are fixed.

Released state: Slick builds on Kex 0.4.0-rc.3 — not yet tagged, so Kex
main for now — with Harmat v0.2.0 and Metro v0.1.0 (see [package.kex](../package.kex) and
[tey.lock](../tey.lock)). The entries below are the history of getting
there.

## Migration check — 2026-10-23

Checked against Kex main `c80e095`, built in a separate worktree: #556, #557
(the fixes for the 2026-10-22 list), #564 and #566 on top of `6dbeda7`.
Still 0.4.0-rc.3, still untagged.

Adopted in Slick:

- **`seeded`, not `sown`,** in `main.kex` (#557: the stdlib's
  `Random.seeded/1` took the capability context away from it — #494).
  `tey run seed` plants the seeds through it.
- **Block parameters spread tuples** (#557, #537): every `match entry do
  (a, b) => … end` over `STATUSES`, `KNOWN` and `DETAILS` is a `{ |a, b| … }`
  block now, and a `reduce` destructures its entry with `let (a, b) = entry`.
  `summed` adds up `counts.values`.
- **File sizes** follow #564: `scaled.to(String, Number.format`#.#`)`,
  which answers `String?`; `readable`, `places:` and `trim:` are gone.
- **`page` is the layout template itself,** not a function calling a
  `layout` value — see the first bug below.

New in Kex main, met here and worked around:

- **A top-level value holding a function loses to a prelude function of
  the same name.** #564 added `NumberFormat.layout`; Slick's
  `let layout = Template.html(…)` called as `layout(live)` then type-checks
  as that (`declared to return String but body returns Result<(Integer,
  Integer, Integer), (Integer, String)>`). A `let layout(body) = …` function
  is unaffected. Reduced:

  ```kex
  let layout = { |body| "<main>${body}</main>" }

  page : String -> String
  let page(live) = layout(live)

  main do
    IO.printLine(page("x"))
  end
  ```

- **Two `_` parameters break the BEAM build** — of a function, a lambda
  or a block, spread from a tuple or not: `let seventh(_: Integer, _:
  Integer) = 7`, `{ |_, _| 0 }` and `[1, 2].reduce(0) { |_, _| 7 }` all fail
  with `duplicate variable '_'` from erlc. Already so on 0.4.0-rc.2; met
  now because #557 lets blocks spread tuples. The walker runs them all, and
  patterns are fine: `let (a, _, _)`, a `(a, _, _) =>` arm, `let [a, _, _]`
  and `[_, _ | rest]` build. `described` uses `_label, _longest` until it
  is fixed.

Still open: `main` is reserved as a local and `slot` as a field (a
decision, not a bug). #557 also fixed a capability beside a module of the
same name, so Metro can make `Metro.Storage.Service` `Metro.Storage`
again, and opencode-bot can name `failureOf` `failed`; neither is done
here.

Validation: Slick builds and passes all 13 specs; the compiled entrypoint
seeds a temporary SQLite database and the server passes `script/smoke.sh`.

## Migration check — 2026-10-22

Checked against local Kex main `6dbeda7` (0.4.0-rc.3, with kexhq/kex#555),
rebuilt from that checkout. Specs and the compiled server ran on it.

Adopted in Slick:

- **The sessions record is `Session` again.** kexhq/kex#539 (filed as
  kexhq/kex#451) makes `first(as: Session)` name the module's own record
  even with `Net.HTTP.WebSocket`'s `Session` linked; the server signs
  people in through it in `script/smoke.sh`.
- **`Attachment.sized` is `readable.to(String, places: 1, trim: true)`**
  (kexhq/kex#491), not rounding by hand. The same four sizes come out.
- **`described` and `chosen`** in `app/live/chat.kex`, for `redescribed`
  and `givenFor`. Both build and pass the profile specs.

Still open, rechecked:

- **#494:** `sown` renamed back to `seeded` still fails with `undefined
  function seeded/1 in commanded/3`.
- **#537:** `STATUSES.map { |glyph, words| … }` over a module constant
  still gives each parameter the whole tuple.
- `main` is still reserved as a local, and `slot` as a field.

Validation: Slick builds and passes all 13 specs, and the compiled
server, against a temporary SQLite database, passes `script/smoke.sh`.

## Migration check — 2026-10-19

Checked against local Kex main `3111d30`, with the compiler, runtime and Tey
rebuilt from that checkout; the installed `kex` still points at an older
build. Harmat is at `ce0f9ae` and Metro at `683a861`, with the local Metro
changes described below. The entries below this section are historical
reproductions, not a list of everything still broken.

Adopted in Slick:

- Harmat's comparison operators (`==`, `>`) instead of `eq`/`gt` calls,
  and `changeColumn(from: ..., to: ...)` instead of a two-line block.
- `transaction` in both the store capability implementation and its call
  to `Harmat.Database.Direct`; Metro storage reads use `Service.get`.
- `Room` is private again. Template fields use `link`, `picture?`, team
  `handle`/`name`/`description`, and profile `name`/`title`/`department`/
  `phone`/`timeZone`/`bio`/`statusText`.
- Records for every read: `all(as:)`/`first(as:)` in all fourteen
  repositories, `pluck` for single columns, `Database.decoded` where a
  row is already in hand — the per-repository `decoded` helpers are gone.
- `after` for the `since` parameters a timestamp is compared against,
  and `public?` for the channel predicate `open?` (kexhq/kex#508).
- One `using Metro.Router, as: Router`: every route call uniformly
  `Router.get`/`post`/…, so a new route cannot fall into the bare-`get`
  trap below.

Still needed or deliberately retained:

- **Imported router names still collide (#494).** With Metro's storage
  `get`/`put` methods loaded, Slick's correctly imported router functions
  produced `expected Char?, got Metro.Router.Entry` and a diagnostic
  claiming `Metro.Storage.Service.put` was not imported. Qualifying the
  calls fixes the build; Slick qualifies all of them through the aliased
  `Router`, and Metro's generated routes now qualify `get` too.
- **The storage capability must still be separate.** A reduced program
  with both `capability Storage` and `module Storage` can call a module
  helper outside `with Storage`, but inside the replacement it fails:
  `undef` on BEAM and `Undefined method: received for Storage.Disk` in the
  interpreter. Keep `Metro.Storage.Service`; its comments now agree with
  its actual API. Do not assume #492 fixed this different case.
- **The entrypoint helper still cannot be named `seeded`.** Renaming `sown`
  back made the full server build fail with `undefined function seeded/1
  in commanded/3`. The specs do not compile the entrypoint, so this was
  caught by the separate application build. Keep `sown` and the other
  function-name workarounds pending a fix.
- **Transactions remain process-local.** Lexical capability capture is
  still why Harmat tracks the current transaction in the owning process.
  Keep `ongoing`/`begun`/`ended` and Slick's direct execution inside it.
- **A private record named like one in the HTTP stack breaks (kexhq/kex#451).**
  Sessions were read as a private `Session` record — fine on its own,
  but once the application (with `Net.HTTP.WebSocket`'s own `Session`)
  is linked, `.first(as: Session)` fails with `Not a record type: Atom`
  and every sign-in breaks. It is `Lease` now. The same collision class
  as `Answer` (not `Response`) and the `open` local (not `main`).
- Inserts stay explicit maps: `record(model, extra)` hides which columns
  are written behind reflection, and the `managed`/`show_nickname`
  spellings it cannot keep had to be smuggled through `extra` anyway —
  tried and backed out. (`show_nickname` is the boolean `nickname_shown`
  since `count_moments`, the field's own name; `users.managed` is still
  a list in text.)
- **Block parameters do not spread tuples from module constants.**
  `pairs.map { |key, value| }` works in Kex's own `tuple_param_pattern`
  spec, over a literal — but over a module-level list
  (`App.Models.Emoji.STATUSES`, `App.Models.User.DETAILS`), the checker
  gives every parameter the whole tuple: `` `preset` expects argument 1
  to be String, but got (String, String) ``. The `match entry do
  (glyph, words) => … end` forms in `app/views/chat.kex` — and their
  siblings in `app/live/chat.kex` and `app/models/emoji.kex` — stay
  until it spreads there too. `do |…|` blocks behave the same, and
  `|(a, b)|` patterns were deliberately never added, so there is no
  shorter spelling today. Found on `3111d30`; filed as
  `kexhq/kex#537`.
- **A module whose name does not mirror its source path is silently
  skipped.** `module App.Authority` in `app/services/authority.kex`
  (should be `App.Services.Authority`) built cleanly — `tey build` exited
  0 and produced no beam — and only later failed as "Unknown module" in a
  spec and "Undefined function" at runtime. The name must match the path;
  a mismatched module should be a build error, not a silent skip.
- **A mixed list does not widen to a union, but a named sum type sidesteps
  it.** `[div(…), "text"]` is refused as `[Element | String]` ("List elements
  must be the same type"), so a tree-shaped HTML DSL cannot use an inline
  union for children. `type Node = Tag(Tag) | Text(String)` works instead:
  `text(…)` and the element constructors all return `Node`, so the collected
  children are homogeneous. Two more things this DSL needed, which are easy
  to get wrong:
  - **`compiled do` names are `%{expr}`, not `%name`.** The aspirational
    sketch (`examples/aspirational/compiled.kex`) writes `let %name?(…)`;
    the working form (stdlib `units/si.kex`) is `let %{name}(…)`, with the
    loop variable used plain in the body.
  - **`using Template` hijacks `render` and `Node`.** Template has its own
    `render`/`Node`; importing it made `Metro.Html`'s recursive `render`
    compile to `Template.render/1` ("undefined function"). Reference
    `Template.escapeHtml` fully-qualified instead of importing Template.
- The manual file-size rounding and other names not migrated here remain;
  this check does not establish that every historical workaround can go.

Harmat had already adopted the applicable API changes; no further Harmat
source changes were needed. Slick's complete specs cover the migrated
queries, migration history, transactions, file previews and view fields.

Validation: Slick builds and passes all 9 specs; Harmat passes 63 and Metro
46, plus a rerun of Metro's 3 generator specs after changing its template.
The compiled Slick entrypoint also seeds and starts against a temporary
SQLite database, and passes `script/smoke.sh` over a real local HTTP port.

## 1. A free function named like a capability method of the same module is not found — [#492](https://github.com/kexhq/kex/issues/492)

A module that implements a capability on one of its records, and also has a
free function of the same name, builds. The free function cannot be called
from outside the module: the BEAM backend emits a call to a `$free` function
it never defines.

```kex
capability Store.Link do
  foul fetch(key: String) -> String = "nothing under ${key}"
end

module Store.Api do
  record Direct do
    label : String = "direct"
  end

  make Direct, implement: Store.Link do
    foul fetch(key: String) -> String = "direct ${key}"
  end

  fetch : String -> String
  foul fetch(key) = Store.Link.fetch(key)
end

main do
  IO.printLine(Store.Api.fetch("k"))
end
```

```
kex_simple: undefined function 'Store.Api.fetch$free'/1 in main/0
error: erlc failed
```

**Expected:** `nothing under k` (no `with` installs `Direct`), or a type error if
the two may not share a name.

**What it takes:** the capability implementation. With a plain `make Direct do`
method of the same name instead, both the method and the free function work,
called from inside the module or out.

**Where it was hit:**
- `Harmat.Database.transaction`, next to `Direct`'s capability method
  `transaction`. The capability method was renamed `atomically`.
- Metro's storage: a capability `Metro.Storage` with `get`/`put`/`delete`,
  implemented by `Metro.Storage.Disk` in a module of the same name, failed
  with `undefined function 'Metro.Storage.get$free'/1`. It was renamed
  `Metro.Storage.Service`. That one is not reduced separately but looks
  like the same bug.

**Closed:** fixed by `kexhq/kex#514` — the program above prints `nothing
under k` on `3111d30`, and `transaction` is back in Harmat and Slick.
Metro's `Service` split is a different, still-open case (see the migration
check): a capability and a module sharing one name, not a free function
beside a method.

## 2. A `var` assigned inside a `with` block is unbound after it — [#493](https://github.com/kexhq/kex/issues/493)

```kex
capability Probe do
  foul named -> String = "default"
end

record Installed do
  label : String = "installed"
end

make Installed, implement: Probe do
  foul named -> String = @label
end

foul seen -> String do
  var result = "unset"
  with Probe = Installed {} do
    result = Probe.named()
  end
  return result
end

main do
  IO.printLine(seen())
end
```

```
kex_main: unbound variable '_ir_result6' in seen/1
error: erlc failed
```

**Expected:** `installed`.

**What it takes:** the `with` block. The same assignment inside an `if` works
(`set in an if`).

**Where it was hit:** `Harmat.Database.Direct.atomically`, which wanted the
work's outcome out of a `with` block. The code that needed it now does it all
inside the block. That turned out not to be the right design for other
reasons; see 4 below.

**Closed:** fixed by `kexhq/kex#513` — the program above prints `installed`
on `3111d30`.

## The others

3. **A capability method named `get` changed what `get(...)` meant elsewhere.**
   Filed with the cases below as
   [#494](https://github.com/kexhq/kex/issues/494): a private function of
   one module takes the place of a same-named function elsewhere.
   While `Metro.Storage.Service` had a method `get`, every
   `get("/path", ~action)` in Slick's `config/routes.kex` (the router's
   `get`, imported with `using Metro.Router, only: [..., get, ...]`) was
   type-checked against `String.get` instead: `expected Char?, got
   Metro.Router.Entry`. Renaming the method to `fetch` fixed it. A small
   program with a capability `get` and an imported `get` does not show it.

   It is not only capabilities: a **private** helper `table(sql) -> String`
   in `Harmat.Log` made `Harmat.Migration`'s `table(LEDGER)` — imported
   from `Harmat.Schema` — resolve to it (`Harmat.Odbc.deleting expects
   argument 1 to be Harmat.Schema.Table, but got String`). Only builds that
   load `Harmat.Log` broke: Slick's server, not its specs. Renamed
   `subjectOf`. So names from one module, even private ones, can take the
   place of a name another module imports.

   Met a third time in opencode-bot: a private `failed : Any -> [String]`
   in `OpenCode.Local` made `main.kex`'s own `failed(reason)` — same name,
   one argument — compile to a call that does not exist
   (`undefined function failed/1 in main/1`). muse-bot, identical but for
   that helper, builds. Renamed `failureOf`. Slick's `main.kex` already
   notes the same for a function it had to call `sown` instead of `seeded`.

   **Still open on `3111d30`:** no fix PR in Kex's log, and Slick's routes
   still qualify every call through the aliased `Router` for it.

4. **A block keeps the capability in force where it was written.** That
   matches the Harmat README ("a replacement reaches the blocks written
   inside it"). The surprise: installing another capability around a
   block's call does not redirect it, so a transaction cannot be made by
   installing a non-committing connection around the work. Harmat keeps
   the transaction in the process instead (`Harmat.Database.ongoing`).
   **Closed as intended behavior:** the language spec (`docs/language-spec.md`,
   capability rules) now says a block "keeps the replacements of the
   region it was **written** in". Process-local transactions stay by design.

5. **A record declared inside `private do` is a bare tuple at run time.**
   [#495](https://github.com/kexhq/kex/issues/495). It
   type-checks, but every field access fails: `Undefined method: viewer for
   Tuple`. Hit with `Room` in Slick's `app/views/chat.kex`; moved to the
   top level. **Closed:** fixed by `kexhq/kex#512` — a private record's
   field reads correctly on `3111d30`, and `Room` is private again (as is
   the sessions `Lease`).

6. **A fully qualified function reference fails when called.**
   Qualified dispatch itself is `kexhq/kex#476`, fixed by `kexhq/kex#482`
   before 0.4.0-rc.1 — small programs work. The full-application failure
   (`~App.Controllers.Files.uploaded` type-checking, then `Undefined
   method: uploaded for Metro.WebRequest.WebRequest` on every request)
   was never reduced and tracks the still-open 3; Slick keeps importing
   `uploaded`/`fetched` by name, which works either way.

7. **A name that was not imported is accepted, then is not there.**
   [#496](https://github.com/kexhq/kex/issues/496).
   `config/routes.kex` imported `get` and `post` from `Metro.Router` but
   not `put`; `put("/commands", ~commandsDeclared)` type-checked (as some
   other `put` — a map's?) and every route failed when the router was
   built: `.try propagated out: :undef`. Importing `put` fixed it.
   **Closed:** fixed by `kexhq/kex#511` — calling past the `only:` list
   is now a check error naming the missing import.

8. **A field named like a function is called in a template** (kexhq/kex#448,
   filed). Met again with `link` (the stdlib's `link`) and `picture?`.
   **Closed for every reported name:** `link`, `picture?`, team
   `handle`/`name`/`description` and the profile fields all render in
   Slick's passing specs on `3111d30`. No dedicated Kex fix PR found, so
   it was resolved incidentally — worth a note on the issue when closing
   it.

## Layout limits

Not bugs, but they keep lines long where the code style wants them short —
[#497](https://github.com/kexhq/kex/issues/497) for the first three, and
[#498](https://github.com/kexhq/kex/issues/498) for the escapes:

- **Closed:** signatures span lines with `->` trailing or leading, and
  `using M, only: [...]` spans its brackets (`kexhq/kex#526`; Kex's own
  spec passes on `3111d30`).
- **Closed as specced:** `then` leads the line after a bare condition
  (`kexhq/kex#526`). After `if` it is still a syntax error — but the
  canonical `if … else … end` already spans lines, so nothing needs it.
- **Closed:** `\e`, `\u{1b}` and `\u{1F680}` all escape
  (`kexhq/kex#527`, verified on `3111d30`).
- Partly freed: `after` names a parameter, a label and a local now
  (`kexhq/kex#508`; Slick's timestamp parameters use it, and its `since`
  locals could follow). `main` and `slot` are still reserved as locals,
  parameters and — for `slot` — fields, so `open` and `Detail.key` stay.

## Names to change back

Chosen to avoid the bugs above, or the limits; worth renaming once they are
fixed, and simplifying where a workaround stayed. The 2026-10-19 migration
changed back `atomically`, `store`/`fetch`/`discard`, `subjectOf`/`valuesOf`,
the `Enclosure`/`Card`/`Crew` fields, top-level `Room`, `since:`, the
two-line `changeColumn`, `prior`/`changed` and `open?`; the 2026-10-22 one
`Lease`, `redescribed`/`givenFor` and the hand rounding. What is left is
below.

| Where | Now | Because | Rather |
| --- | --- | --- | --- |
| Metro | `Metro.Storage.Service` capability | #492; fixed by kexhq/kex#557 | `Metro.Storage` |
| Metro | `Metro.Storage.folder()` | ENV is effectful in a constant | a `ROOT` constant, if config may be read once |
| Harmat | `Harmat.Logger` (logger.kex) beside `Harmat.Log` (log.kex) | a capability is found by its file; and 1 | one `Harmat.Log` |
| opencode-bot `local.kex` | `failureOf` | #494; fixed by kexhq/kex#557 | `failed` |
| Harmat | `Database.ongoing`, `begun`, `ended` | 4 | private to Harmat, if the store's connection can be given the transaction another way |
| Slick `app/views/chat.kex` | `Detail.key` | `slot` is a keyword | `slot` or `column` |
| Slick `app/views/chat.kex` | `let open = pane(…)` | `main` is a keyword | `main` |
| Slick `config/routes.kex` | imported `uploaded`, `fetched` | 6 (works on 286c026) | either way |
| Slick `app/live/chat.kex` | `\|column, _label, _longest\|` | two `_` parameters fail on BEAM | `\|column, _, _\|` |
