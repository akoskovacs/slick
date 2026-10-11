# Slick

A [Metro](https://github.com/akoskovacs/metro) application.

```sh
sh script/setup.sh # once: dependencies, the ODBC port program
tey server         # http://127.0.0.1:4000 — register, then you are in
tey test
```

Needs unixODBC and a SQLite ODBC driver (`brew install unixodbc sqliteodbc`).

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
spec/
```

## Database

| `METRO_ENV` | Database |
| --- | --- |
| `development` (default) | SQLite, `db/development.sqlite3` |
| `test` | SQLite, `db/test.sqlite3` |
| `production` | whatever `DATABASE_DSN` names |

```sh
tey migrate
tey rollback
tey seed       # development: Acme, ada@example.com / "correct horse", a bot
```

Seeds are apart from the migrations (`db/seeds.kex`), and planting them
twice plants once. Only development has any.
