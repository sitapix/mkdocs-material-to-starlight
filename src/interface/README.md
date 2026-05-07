# Interface Layer

User-facing entry points: the CLI and the programmatic API. **Thin**: these modules wire infrastructure adapters into use-cases and present results. No business logic lives here.

## Allowed imports

- `use-cases/`
- `infrastructure/` (instantiating concrete adapters)
- `domain/` (for surface types only)

## Sub-modules

- `cli/`: argument parsing, command dispatch, exit codes, terminal output
- `api/`: programmatic exports (`convertSite`, `convertFile`, `compileNavigation`)
