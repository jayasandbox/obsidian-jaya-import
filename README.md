# Obsidian Jaya Import

Import [Jaya Sandbox Adventure Generator](https://jayasandbox.com) adventures into your Obsidian vault. Re-import safely — your hand-written prose around Jaya-managed sections is preserved.

## Features

- **Drop-in import** — file-picker modal accepts the `.zip` Jaya produces.
- **Stable identity** — entities are matched by `jaya-public-id` frontmatter, not filename.
- **Splice on update** — Jaya-managed content (between `<!-- jaya:begin -->` / `<!-- jaya:end -->`) is replaced; anything outside is yours and stays untouched.
- **Idempotent** — re-import the same zip and nothing changes.
- **Aliases accumulate** — renames in Jaya add to the alias array so old wikilinks still resolve.
- **Mobile-compatible** — works on Obsidian desktop, iOS, and Android.

## Install

### Recommended (post-store-approval)

Settings → Community plugins → Browse → search "Jaya Sandbox Import" → Install → Enable.

### BRAT (pre-store-approval)

1. Install [BRAT](https://obsidian.md/plugins?id=obsidian42-brat).
2. BRAT → Add Beta plugin → enter `jayasandbox/obsidian-jaya-import`.
3. Enable "Jaya Sandbox Import" in Community plugins settings.

## Usage

1. In Jaya, generate an adventure export and choose **Obsidian Vault** format. Download the `.zip`.
2. In Obsidian: Cmd/Ctrl-P → **Jaya: Import adventure ZIP** → pick the file.
3. New notes appear under your configured target folder (default `Jaya/`); existing notes are spliced.

## Wire format

This plugin implements wire-format **version 1**. The format spec lives in the Jaya repo at `docs/obsidian-export-format/spec.md`.

## Settings

| Setting | Default | Notes |
|---|---|---|
| Target vault folder | `Jaya` | Where new notes are written. |
| Conflict policy | Splice | Splice (preserve outside-marker prose), Replace (overwrite whole file), New (create with `-N` suffix). |
| Show summary modal | On | Toggle the post-import results modal. |

## Build from source

```
git clone https://github.com/jayasandbox/obsidian-jaya-import.git
cd obsidian-jaya-import
npm install
npm run build
```

## Tests

```
npm test
```

The Vitest suite covers the pure-TS `core/` module: ManifestValidator, FrontmatterParser, MarkerSplicer, PublicIdIndex, ZipReader, Importer orchestrator, and a fixture-driven parity test against the wire-format reference fixtures.

## License

[MIT](LICENSE).
