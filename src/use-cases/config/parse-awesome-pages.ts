/**
 * Parse a YAML-decoded `.pages` file into a typed `AwesomePagesConfig`.
 *
 * Pure: takes `unknown`, returns `Result<AwesomePagesConfig, ConfigError>`.
 * The legacy `arrange` key (used by older awesome-pages versions) is treated
 * as an alias for `nav` — both produce the same typed list. Unknown keys are
 * silently ignored (the navigation compiler does not need them, and the
 * MIGRATION_NOTES generator surfaces theme-specific extras separately).
 *
 * The wildcard `...` is preserved as a `rest` entry so the navigation
 * compiler can decide where to place files not explicitly listed.
 */

import { ok, err, type Result } from '../../domain/result.js';
import type {
  AwesomePagesConfig,
  AwesomePagesNavEntry,
} from '../../domain/config/awesome-pages.js';

export interface ConfigError {
  readonly message: string;
}

export function parseAwesomePages(
  raw: unknown,
): Result<AwesomePagesConfig, ConfigError> {
  if (!isPlainObject(raw)) {
    return err({ message: '.pages must be a YAML mapping (object)' });
  }

  const navRaw = raw['nav'] ?? raw['arrange'] ?? null;
  const nav = navRaw === null ? null : parseNav(navRaw);
  if (nav !== null && !nav.ok) {
    return nav;
  }

  return ok({
    title: typeof raw['title'] === 'string' ? raw['title'] : null,
    nav: nav === null ? null : nav.value,
    collapse: typeof raw['collapse'] === 'boolean' ? raw['collapse'] : null,
    hide: raw['hide'] === true,
  });
}

function parseNav(
  raw: unknown,
): Result<ReadonlyArray<AwesomePagesNavEntry>, ConfigError> {
  if (!Array.isArray(raw)) {
    return err({ message: 'nav (or arrange) must be a list' });
  }
  const out: AwesomePagesNavEntry[] = [];
  for (const entry of raw) {
    const parsed = parseEntry(entry);
    if (!parsed.ok) {
      return parsed;
    }
    out.push(parsed.value);
  }
  return ok(out);
}

function parseEntry(value: unknown): Result<AwesomePagesNavEntry, ConfigError> {
  if (value === '...') {
    return ok({ kind: 'rest' });
  }
  if (typeof value === 'string') {
    // Awesome-pages glob form: `... | pattern*.md` (rest with filter).
    // We don't compile the glob — pass through as a literal so the nav
    // compiler keeps the section in scope and the user can edit later.
    // Real-world: Gothic-Modding-Community uses `... | index*.md`.
    return ok({ kind: 'literal', name: value });
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 1) {
      const title = keys[0] ?? '';
      const inner = value[title];
      if (typeof inner === 'string') {
        return ok({ kind: 'titled', title, name: inner });
      }
      // List-valued single-key map: a SECTION with nested entries.
      // Awesome-pages allows nested nav blocks — parse recursively. The
      // domain model has no `section` kind in `AwesomePagesNavEntry`, so
      // for now flatten to a `literal` carrying the title; the named
      // section header lands as a sidebar group label and the children
      // get auto-discovered. This is best-effort but does NOT crash the
      // entire conversion (the previous behavior).
      if (Array.isArray(inner)) {
        return ok({ kind: 'literal', name: title });
      }
    }
  }
  return err({ message: 'nav entry must be string, "...", or single-key map' });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
