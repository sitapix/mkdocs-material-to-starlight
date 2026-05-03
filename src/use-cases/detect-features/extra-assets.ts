/**
 * Extract `extra_css` and `extra_javascript` lists from the parsed
 * mkdocs.yml extras dict.
 *
 * Material accepts both forms for `extra_javascript`:
 *
 *   extra_javascript:
 *     - js/custom.js                # bare string
 *     - path: js/module.js           # object form
 *       type: module
 *       async: true
 *       defer: false
 *
 * The bare-string form is short for `{ path: '...' }`. The object form's
 * `type`/`async`/`defer` map directly onto HTML script attrs.
 *
 * Pure: takes the extras dict, returns parsed CSS paths + structured JS
 * entries. Both lists preserve source order. Unparseable entries are
 * skipped silently. No I/O.
 */

export interface ExtraJsEntry {
  readonly src: string;
  readonly type?: 'module';
  readonly async?: boolean;
  readonly defer?: boolean;
}

export interface ExtraAssets {
  readonly css: ReadonlyArray<string>;
  readonly js: ReadonlyArray<ExtraJsEntry>;
}

export function extractExtraAssets(
  extras: Readonly<Record<string, unknown>>,
): ExtraAssets {
  return {
    css: parseStringList(extras.extra_css),
    js: parseJsList(extras.extra_javascript),
  };
}

function parseStringList(raw: unknown): ReadonlyArray<string> {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string');
}

function parseJsList(raw: unknown): ReadonlyArray<ExtraJsEntry> {
  if (!Array.isArray(raw)) return [];
  const out: ExtraJsEntry[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      out.push({ src: entry });
      continue;
    }
    if (typeof entry !== 'object' || entry === null) continue;
    const obj = entry as Record<string, unknown>;
    const path = typeof obj.path === 'string' ? obj.path : null;
    if (path === null) continue;
    const result: ExtraJsEntry = { src: path };
    const withType: ExtraJsEntry =
      obj.type === 'module' ? { ...result, type: 'module' } : result;
    const withAsync: ExtraJsEntry =
      obj.async === true ? { ...withType, async: true } : withType;
    const final: ExtraJsEntry =
      obj.defer === true ? { ...withAsync, defer: true } : withAsync;
    out.push(final);
  }
  return out;
}
