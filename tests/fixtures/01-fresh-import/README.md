# Fixture 01 — Fresh Import

A fresh import of one world's adventure into an empty vault.

## Source data (`source-world.json`)

Synthetic seed: 1 world, 1 narrative (Quest), 2 NPCs (one in a faction), 1 faction, 1 ForgedLoc (AdventureSite, Arcane theme), 2 goals (one Major, one Motivation).

Loaded by `Tests/DataTests/ObsidianMarkdownRendererTests.cs` via `FixtureSeeder.SeedFromJson(source-world.json)`.

## Expected output (`expected-vault/`)

The vault tree the export should produce. The renderer's snapshot test asserts byte-equivalence against this tree (line-ending normalized to LF, fingerprint placeholders matched as regex).

`input.zip` is **regenerated** by `dotnet test --filter ObsidianFixturesRegenerationTests` and committed alongside the expected-vault tree. Do not hand-edit `input.zip`.
