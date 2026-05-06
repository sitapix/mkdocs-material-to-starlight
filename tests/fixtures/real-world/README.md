# Real-world fixture corpus

This directory holds eight real MkDocs Material projects (the source
trees in `<name>/`) paired with the converter's expected output (the
`<name>-out*/` trees). They exist for two purposes, in this order:

1. **Manual review of converter output.** When a transform changes
   behaviour, run `npm run regen-fixtures -- <name>` and inspect the
   resulting diff. Visible changes go into the PR description.
2. **Reference points for new tests.** When a regression surfaces in one
   of these projects, encode it as a focused test under
   `tests/integration/` rather than asserting against the whole tree.

> **No byte-equality assertion runs on these trees today.** They are not
> snapshots in the test-runner sense. Adding wholesale equality would
> turn every cosmetic change (bullet style, blank-line collapse) into a
> red diff and force a regen on every PR — too brittle for the value.
> If you need a regression locked in, write a targeted test instead.

## Regenerating

```bash
npm run regen-fixtures             # rebuild every <name>-out
npm run regen-fixtures -- httpx    # rebuild a single fixture
```

The script reads each `<name>/mkdocs.yml`, runs `convertSiteFromDisk`
with `--force` against `<name>-out/`, and reports what changed. It does
not commit; review the git diff, sanity-check the changes, and commit
intentionally.

## Adding a fixture

1. Add the source tree under `<name>/` (just the parts the converter
   needs: `mkdocs.yml`, `docs/`, any plugin assets).
2. Run `npm run regen-fixtures -- <name>` to produce `<name>-out/`.
3. Skim the output, commit both trees together with a one-line
   description of what feature this fixture exercises that the existing
   eight don't.

## Excluded artefacts

`.astro/` (Astro's build cache) and `node_modules/` are
git-ignored under every `<name>-out/` tree. They are produced by Astro
itself when a user runs `npm install && npm run build` against the
output — they're not converter output and shouldn't be tracked here.
