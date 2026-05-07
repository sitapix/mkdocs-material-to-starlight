# Use-Cases Layer

Application orchestration: pure functions that compose domain values into conversion outputs. **Functional core**: every function is deterministic given its inputs; side effects live in `infrastructure/`.

The conversion pipeline, the navigation compiler, the snippet expansion, the link rewriter. Every use case takes data in and returns data out.

## Allowed imports

- `domain/` (everything)
- Other modules in `use-cases/`
- Pure third-party libraries that take and return data (e.g., `unified`, `unist-util-visit`, `mdast-util-*`)

## Forbidden imports

- `infrastructure/`: only via abstract repository/port interfaces declared in `domain/` and injected at the boundary
- `interface/`: never

## Sub-modules

- `normalize/`: pre-parse text normalization (text → text); rewrites MkDocs syntax to `remark-directive` form
- `transform/`: MDAST → MDAST plugin implementations; one plugin per construct, namespaces disjoint
- `convert-file/`: single-file orchestrator (the six-stage pipeline)
- `compile-navigation/`: `mkdocs.yml` + `.pages` → Starlight sidebar config + slug map
- `pipeline/`: assembler that validates plugin DAG and produces an executable processor
