# Word catalog service

This service owns the PostgreSQL `imposter_words` database. Its `word_pairs`
table stores the common word and the hint given to impostors. Other services
request one pair when a game starts. The service has no browser endpoints.

## Configuration

Environment variables use double underscores for nested settings:

- `ConnectionStrings__Words`: required PostgreSQL connection string. Development
  settings use `localhost:5432`, database `imposter_words`, user `imposter`, and
  password `imposter_dev` for the local development database.
- `Services__ApiKey`: required shared key. The game service sends this value in
  its `X-Service-Key` header. Keep this key on the server.
- `SeedDemoWords`: defaults to false, enabled in Development settings. Inserts
  12 demonstration pairs without overwriting existing words.
- `ASPNETCORE_URLS`: the Docker image listens on port 8080. The local launch
  profile listens on `http://localhost:5081`.

Start from the repository root after the PostgreSQL database is running:

```powershell
$env:Services__ApiKey = 'dev-imposter-service-key-local-only'
dotnet run --project src/Imposter.Words.Api
```

The startup task creates the table with a 30 second retry limit. Schema and seed
changes run in one transaction. Restart the service after resolving an initial
database outage if the schema has not been created yet. Use versioned migrations
when the schema starts evolving; `CREATE TABLE IF NOT EXISTS` is only the initial
development bootstrap.

## Internal contract

- `GET /internal/words/random`: requires `X-Service-Key`, returns HTTP 200 with
  `{ "word": "Volcano", "hint": "Mountain" }`. Returns 401 for a missing or
  incorrect key, or 503 when the database is unavailable or contains no words.
- `GET /health/live`: always returns HTTP 200 while the service runs.
- `GET /health/ready`: returns HTTP 200 when PostgreSQL responds and the catalog
  contains at least one word, otherwise HTTP 503. It never reveals a word or hint.

MediatR dispatches the query within this process. Communication from the game
service uses HTTP. Database contents and shared keys are not logged.

## Authoring words

Disable `SeedDemoWords` when replacing the demonstration catalog. Run SQL against
the `imposter_words` database using your preferred PostgreSQL client:

```sql
INSERT INTO word_pairs (word, hint)
VALUES ('Your common word', 'Your hint')
ON CONFLICT (word) DO UPDATE SET hint = EXCLUDED.hint;
```

Words must contain 1 to 80 characters and hints 1 to 160 characters. Both must
have no leading or trailing spaces. A hint must differ from its word after
Unicode compatibility normalization (NFKC) and case folding with PostgreSQL
`lower`. Words are unique and case sensitive in this initial schema. PostgreSQL
must use UTF8 encoding for the normalization check. The service does not store
nicknames, votes, or game state in its database.
