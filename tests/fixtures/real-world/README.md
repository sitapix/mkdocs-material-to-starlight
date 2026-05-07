# Real-world fixture corpus

This directory is intentionally near-empty. Source and converted-output
trees for eight real MkDocs Material projects (aws-nuke, fastapi, httpx,
polars, privacyguides.org, pydantic, sqlmodel, typer) live here only on
your local machine, never in git.

Both shapes are git-ignored:

- `<name>/` — source tree you cloned for regeneration
- `<name>-out/` (or `<name>-en-out/`) — output tree the converter wrote

No automated test reads these paths. They exist purely as a manual
inspection target: when a transform changes behaviour, you regen output
locally and skim the diff.

## Regenerating

```bash
# clone a source tree alongside this README
git clone --depth=1 https://github.com/encode/httpx tests/fixtures/real-world/httpx

# convert it
npm run regen-fixtures             # every <name>/ found
npm run regen-fixtures -- httpx    # one fixture
```

The script reads each `<name>/mkdocs.yml`, runs `convertSiteFromDisk`
with `--force` against `<name>-out/`, and reports what changed. Inspect
the result locally; nothing here gets committed.

## Locking in a regression

If a real-site regression surfaces, encode it as a focused test under
`tests/integration/` rather than reaching for byte-equality on a 200 MB
output tree.
