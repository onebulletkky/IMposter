# API integration tests

These tests use the real Game API request pipeline and PostgreSQL row locks. The word service returns a fixed word pair through an HTTP test handler. A controllable server clock makes deadline checks deterministic.

Set `TEST_GAMES_CONNECTION` to a PostgreSQL test database whose user can create schemas, then run this project explicitly:

```powershell
$env:TEST_GAMES_CONNECTION = 'Host=localhost;Port=55432;Database=imposter_games;Username=imposter'
dotnet test tests/Imposter.Game.Api.Tests/Imposter.Game.Api.Tests.csproj
```

The tests create a unique `game_api_test_` schema and remove only that schema when finished. They fail with an explanatory error when `TEST_GAMES_CONNECTION` is missing or PostgreSQL is unavailable. No integration tests silently skip.

The suite checks session authentication, private response data, database persistence across API instances, host and turn permissions, code normalization, and simultaneous confirmations and votes. Run the domain test project separately when PostgreSQL is not available.
