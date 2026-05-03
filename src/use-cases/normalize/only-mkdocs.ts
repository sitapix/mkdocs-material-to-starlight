/**
 * Strip `<!-- only-mkdocs -->` ... `<!-- /only-mkdocs -->` content blocks.
 *
 * FastAPI convention: `index.md` doubles as PyPI README, with content gated
 * by these markers. The README build strips the marker pair AND the wrapped
 * content; the docs site keeps them. For Starlight migration, the user has
 * decided to ship the docs site, so we KEEP the wrapped content but strip
 * the markers.
 *
 * Symmetric: `<!-- only-pypi -->` ... `<!-- /only-pypi -->` blocks contain
 * content meant for the PyPI README only — we DROP that content.
 *
 * Pure: text → text. Idempotent (markers never reappear).
 */

const ONLY_MKDOCS_RE = /<!--\s*only-mkdocs\s*-->|<!--\s*\/only-mkdocs\s*-->/g;
const ONLY_PYPI_RE = /<!--\s*only-pypi\s*-->[\s\S]*?<!--\s*\/only-pypi\s*-->/g;

export function normalizeOnlyMkdocs(source: string): string {
  return source.replace(ONLY_PYPI_RE, '').replace(ONLY_MKDOCS_RE, '');
}
