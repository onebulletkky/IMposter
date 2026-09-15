# Impostor

A multiplayer Impostor game with C#/.NET 10 services, React/TypeScript, Material UI, and PostgreSQL 18. Use Discord for voice while the app handles lobbies, secret words, turns, votes, and the final guess.

## Start with Docker

Install Docker with Compose, then run from the repository root:

```powershell
Copy-Item .env.example .env
docker compose up --build -d
```

Open http://localhost:8080. Use at least three separate browser tabs, enter a different nickname in each, and share the five-character code. Each tab stores its own player session. A page refresh restores that player. Open new tabs normally: duplicating a tab can copy its session storage.

```powershell
docker compose logs -f
docker compose down
```

Stopping Compose preserves the PostgreSQL volume. Both lobbies and word pairs persist. The initial database creation script runs only when that volume is first initialized.

## Start on Windows without Docker

Prerequisites: .NET 10 SDK, Node.js 22.12 or newer, PostgreSQL 18 binaries, and PowerShell. Docker is optional. The scripts use a separate PostgreSQL cluster under `.local/postgres`, bound to `127.0.0.1:55432`. It uses local trust authentication for development and does not modify an existing database server.

This workspace includes a downloaded portable Node.js runtime under `.tools`. On another machine, install Node.js normally or download the portable runtime with the checksum-verified helper:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/Install-Node.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/Start-Local.ps1
```

Open http://127.0.0.1:5173. The startup script builds the backend, installs locked frontend dependencies, starts both services and Vite, and checks readiness. PostgreSQL is expected at `C:\Program Files\PostgreSQL\18\bin`; supply `-PostgresBin` if it is elsewhere. Logs and process records are in `.local`, which is ignored by Git.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/Stop-Local.ps1
```

These commands allow the selected script in that PowerShell process without changing the machine's execution policy. The stop script preserves database files and only stops recorded app processes whose command lines match the workspace. To rebuild the backend after changes, stop and start again. Vite reloads frontend edits automatically.

### Run services with backend hot reload

Alternatively, start PostgreSQL with `docker compose up -d postgres`. Set these values in each backend terminal, then run the relevant command below:

```powershell
$env:Services__ApiKey = 'dev-imposter-service-key-local-only'
```

```powershell
dotnet watch --project src/Imposter.Words.Api
```

```powershell
dotnet watch --project src/Imposter.Game.Api
```

Development settings connect to PostgreSQL on port 5432 using the `.env.example` defaults. If you change those credentials, override `ConnectionStrings__Words` and `ConnectionStrings__Games` accordingly. Use port 55432 and user `imposter` without a password for the workspace cluster created by Start-Local.

In a frontend terminal:

```powershell
cd src/imposter-web
npm ci
npm run dev
```

Vite proxies `/api` to the game service on port 5080. The word service listens on port 5081. Compose uses Nginx to serve the built frontend and proxy `/api`; only the web service and a loopback PostgreSQL port are exposed to the host.

## Architecture

```text
Browser: React + Material UI
    |
    | HTTP /api, private authenticated polling every second
    v
Game API: .NET 10 + MediatR
    |                       |
    | SQL                   | HTTP with service key
    v                       v
imposter_games          Words API: .NET 10 + MediatR
                            |
                            | SQL
                            v
                        imposter_words
```

- Game API owns lobby membership, hashed player tokens, settings, roles, current turn, deadlines, votes, guesses, and results.
- Word API owns common word/hint pairs and selects a random pair when a game starts.
- Each service has its own database on one PostgreSQL server for a small local footprint. They never read each other's tables.
- MediatR dispatches commands and queries **inside a process**. HTTP is the transport between services. No message broker or Redis is required.
- MediatR is pinned to **12.5.0**, whose source has the Apache 2.0 license. Review the license and upgrade implications before changing its major version. [MediatR source](https://github.com/LuckyPennySoftware/MediatR/tree/v12.5.0)

The game database stores each lobby as a JSON document. Every change takes a PostgreSQL row lock so simultaneous actions, including actions routed to different API instances, cannot overwrite each other. Unchanged polls avoid rewriting that document. A background worker advances expired turns even when no player has a page open. Deadlines survive a restart and catch up to elapsed time.

Player tokens are random, returned only when joining, stored in session storage, and sent as bearer tokens. Only their SHA-256 hashes are persisted. Private responses contain the current player's role and word, while other roles and the common word remain hidden until the game finishes. The internal word endpoint requires a service key and is not proxied to browsers.

## Game rules in this starter

1. A nickname of 1-24 characters is required for both create and join. Nicknames must be unique within a lobby. Codes contain five uppercase letters or digits; joining is case-insensitive.
2. Games support 3-16 players. The host configures 1-5 guaranteed impostors, a 0-100 percent chance of adding **one extra impostor**, 1-10 rounds, and 10-180 seconds per turn. The settings must leave at least one crew member even if the extra impostor is selected.
3. Impostors see the hint; crew members see the common word. All impostors are on one team. The server selects roles randomly when the host starts.
4. A round visits every player once in lobby join order. The timer applies to each player's turn. The current player confirms their spoken clue, or the server advances when time runs out.
5. After all rounds, every player casts one final, private vote for another player. Self-votes and changing votes are disabled. Totals appear only after everyone votes.
6. Impostors must guess the common word correctly to win, regardless of who received the most votes. They share one attempt, or **three shared attempts if the highest vote total is tied**. Any impostor may submit a guess. These resolve the currently unspecified team/vote details and can be changed in `GameRules`.
7. A correct guess ends the game immediately. Otherwise crew wins when attempts run out. The common word and all roles are revealed only when the game finishes, preserving the challenge during the three-guess tie case. Guesses ignore case and surrounding whitespace and normalize Unicode compatibility characters.
8. The host can return everyone to the lobby for a rematch. Players may leave in the lobby or after results; leaving as host transfers hosting to the next player.

Disconnected players keep their seat and can resume by refreshing the same tab. Their clue turns expire normally. Voting and guessing intentionally wait for required players; there is currently no kick, forfeit, or vote timeout. A lobby expires after 24 hours without activity. Do not close the original tab if you need to retain that anonymous player session.

## Define words and hints later

The development seed contains a small example pack. It is enabled in Development and through `SEED_DEMO_WORDS=true` in Compose. It is not a final word list. Set `SEED_DEMO_WORDS=false` for Compose or `SeedDemoWords=false` for native service startup to disable demo seeding. Disabling seeding does not remove existing rows.

Edit the catalog using SQL in `imposter_words`, for example through psql or your database editor:

```sql
INSERT INTO word_pairs (word, hint)
VALUES ('Volcano', 'Heat')
ON CONFLICT (word) DO UPDATE SET hint = EXCLUDED.hint;
```

The schema and example pack live in `src/Imposter.Words.Api/db`. Words support up to 80 characters, hints up to 160, and both must be nonempty and different. Empty catalogs make the word service readiness endpoint return 503; lobbies remain usable, but games cannot start until valid pairs are added. No AI generation or paid API is used for words.

## Project layout

```text
src/Imposter.Game.Domain       Game rules and private views
src/Imposter.Game.Api          Public API, PostgreSQL persistence, timer worker
src/Imposter.Words.Api         Internal word catalog and SQL schema
src/imposter-web               React, TypeScript, Material UI, Vite
tests/Imposter.Game.Domain.Tests
tests/Imposter.Game.Api.Tests  Real PostgreSQL HTTP integration tests
infra/postgres                Initial database creation
scripts                       Windows startup and shutdown helpers
.github/workflows/ci.yml       Builds and tests with PostgreSQL
```

## Validate changes

```powershell
dotnet build Imposter.slnx
dotnet test tests/Imposter.Game.Domain.Tests
$env:TEST_GAMES_CONNECTION = 'Host=127.0.0.1;Port=55432;Database=imposter_games;Username=imposter'
dotnet test tests/Imposter.Game.Api.Tests
cd src/imposter-web
npm test
npm run build
```

With both services running, `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/Smoke-Test.ps1` plays a complete three-player game through HTTP, including the real word service, tied votes, final reveal, rematch, and lobby cleanup.

API integration tests require PostgreSQL and an explicit `TEST_GAMES_CONNECTION`. They create a separate schema per run and remove only that schema. CI supplies PostgreSQL automatically. Tests cover secret isolation, persisted sessions, host permissions, concurrent turns and votes, timeouts, win conditions, and frontend controls.

## Current scope

This is a runnable development starter. Schema initialization is automatic and uses `CREATE TABLE IF NOT EXISTS`; add versioned migrations before changing a deployed schema. The game stores full lobby state rather than a historical event log. HTTP polling supports multiple API instances without a SignalR backplane. Public deployment still needs your domain/TLS setup, private service networking, separate database credentials, backups, and replacement of the example secrets. Discord is used externally; no bot, voice capture, or in-app chat is included.

Primary stack references: [.NET support](https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core), [Material UI installation](https://mui.com/material-ui/getting-started/installation/), [Npgsql documentation](https://www.npgsql.org/doc/index.html), [Vite guide](https://vite.dev/guide/).
