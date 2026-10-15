# Kex findings from Slick, Metro and Harmat

Bugs and limits met while building Slick on Kex 0.4.0-rc.1 (358c056), on the
BEAM, that are not filed yet. The two at the top are reduced to the smallest
program that shows them; the rest still need reducing. At the end: names in
the code that were chosen only to avoid these, to rename once they are fixed.

## 1. A free function named like a capability method of the same module is not found

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

## 2. A `var` assigned inside a `with` block is unbound after it

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

## Not reduced yet

3. **A capability method named `get` changed what `get(...)` meant elsewhere.**
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

4. **A block keeps the capability in force where it was written.** That
   matches the Harmat README ("a replacement reaches the blocks written
   inside it"). The surprise: installing another capability around a
   block's call does not redirect it, so a transaction cannot be made by
   installing a non-committing connection around the work. Harmat keeps
   the transaction in the process instead (`Harmat.Database.ongoing`).
   Possibly not a bug, but worth a sentence in the language docs.

5. **A record declared inside `private do` is a bare tuple at run time.** It
   type-checks, but every field access fails: `Undefined method: viewer for
   Tuple`. Hit with `Room` in Slick's `app/views/chat.kex`; moved to the
   top level.

6. **A fully qualified function reference fails when called.** A route
   written `post("/uploads", ~App.Controllers.Files.uploaded)`
   type-checked, then failed on every request with `Undefined method:
   uploaded for Metro.WebRequest.WebRequest`. Importing the name and
   writing `~uploaded` works. This may have been a symptom of 3.

7. **A name that was not imported is accepted, then is not there.**
   `config/routes.kex` imported `get` and `post` from `Metro.Router` but
   not `put`; `put("/commands", ~commandsDeclared)` type-checked (as some
   other `put` — a map's?) and every route failed when the router was
   built: `.try propagated out: :undef`. Importing `put` fixed it.

8. **A field named like a function is called in a template** (kexhq/kex#448,
   filed). Met again with `link` (the stdlib's `link`) and `picture?`.

## Layout limits

Not bugs, but they keep lines long where the code style wants them short:

- A type signature must be on one line: neither `->` at the start of a line
  nor at the end continues it. Typed parameters, one per line, work instead.
- `using M, only: [...]` must be on one line.
- A line cannot start with `then`; `if … else … end` as an expression works.
- Strings have no escape for ESC, or for any code point: `\e` is `e` and
  `\u{1b}` is literal. `Console` covers colors.
- `after`, `main` and `slot` are keywords, which surprises as a parameter or
  variable name (`since`, `open` and `key` were used).

## Names to change back

Chosen to avoid the bugs above, or the limits; worth renaming once they are
fixed, and simplifying where a workaround stayed.

| Where | Now | Because | Rather |
| --- | --- | --- | --- |
| `Harmat.Connection` | `atomically` | 1 | `transaction` |
| Metro | `Metro.Storage.Service` capability | 1 | `Metro.Storage` |
| Metro | `store` / `fetch` / `discard` | 3 | `put` / `get` / `delete` |
| Metro | `Metro.Storage.folder()` | ENV is effectful in a constant | a `ROOT` constant, if config may be read once |
| Harmat | `Harmat.Logger` (logger.kex) beside `Harmat.Log` (log.kex) | a capability is found by its file; and 1 | one `Harmat.Log` |
| Harmat `log.kex` | `subjectOf`, `valuesOf` | 3 | `table`, `shown` |
| opencode-bot `local.kex` | `failureOf` | 3 | `failed` |
| Harmat | `Database.ongoing`, `begun`, `ended` | 4 | private to Harmat, if the store's connection can be given the transaction another way |
| Slick `app/views/chat.kex` | `Enclosure.href`, `pictured?` | 7 | `link`, `picture?` |
| Slick `app/views/chat.kex` | `Card` fields `formal`, `alias`, `role`, `team`, `dial`, `zone`, `about`, `motto`, `keeper` | 7 | the `User` field names |
| Slick `app/views/chat.kex` | `Detail.key` | `slot` is a keyword | `slot` or `column` |
| Slick `app/views/chat.kex` | `Room` at the top level | 5 | private |
| Slick `app/views/chat.kex` | `let open = pane(…)` | `main` is a keyword | `main` |
| Slick `app/live/chat.kex` | `redescribed`, `givenFor` | kexhq/kex#451; a local `chosen` | `described`, `chosen` |
| Slick `config/routes.kex` | imported `uploaded`, `fetched` | 6 | either way, once both work |
| Slick `db/repositories/messages.kex` | `newer(…, since:)` | `after` is a keyword | `after` |
| Slick `app/models/attachment.kex` | rounding by hand | kexhq/kex#491 | `to(String, places: 1)` |
