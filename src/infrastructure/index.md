# Infrastructure Layer

The **imperative shell**. Everything that touches the file system, the network, the clock, or any other side-effecting resource. Each module exposes a small, named adapter that the use-cases layer consumes through dependency injection.

## Allowed imports

- `domain/` — for shared types and ports
- Third-party libraries with side effects (`node:fs`, `js-yaml`, `worker_threads`, `vfile-reporter`)

## Forbidden imports

- `use-cases/` — never (use-cases depend on infrastructure ports, not the other way around)
- `interface/` — never

## Sub-modules

- `fs/` — file system reader/writer, glob walker, atomic writes
- `yaml/` — YAML parsing for `mkdocs.yml` and `.pages` files
- `parsers/` — `unified` processor factories; the only place that constructs concrete remark pipelines
- `reporters/` — `vfile-reporter` integration, JSON migration-report writer
- `workers/` — `worker_threads` pool for parallel per-file conversion
