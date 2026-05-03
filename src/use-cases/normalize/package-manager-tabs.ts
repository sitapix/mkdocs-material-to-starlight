/**
 * Pre-parse normalizer: detect tab groups where every tab is labeled with a
 * package-manager name (npm, yarn, pnpm, bun — any subset of ≥2) and rewrite
 * them to a `<PackageManagers pkg="...">` MDX component from the
 * `starlight-package-managers` package.
 *
 * When the package name can be extracted from the npm tab body (looking for
 * `npm install <pkg>` or `npm add <pkg>`), the promoted component is emitted.
 * When extraction fails, the group is left as plain `::::tabs` / `:::tab`
 * directives (the standard content-tab normalizer already ran first) and a
 * diagnostic is attached so the user can locate the fallback.
 *
 * This normalizer runs AFTER `normalizeContentTabs` has already converted
 * `=== "npm"` blocks to `::::tabs / :::tab[npm]` directive syntax, so the
 * pattern matching works on the directive form.
 *
 * Idempotent: the emitted `<PackageManagers>` tag does not contain `:::tab`
 * so re-running the normalizer is a no-op.
 */

import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';

const PM_LABELS = new Set(['npm', 'yarn', 'pnpm', 'bun']);

export interface NormalizePackageManagerTabsResult {
  readonly text: string;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
  /** True if at least one tab group was promoted to <PackageManagers>. */
  readonly promoted: boolean;
}

const SOURCE = 'normalize/package-manager-tabs';

/**
 * The text coming in has already been through `normalizeContentTabs`, so
 * tab groups look like:
 *
 *   ::::tabs
 *   :::tab[npm]
 *   npm install foo
 *   :::
 *   :::tab[yarn]
 *   yarn add foo
 *   :::
 *   ::::
 */
export function normalizePackageManagerTabs(
  source: string,
  sourcePath: string,
): NormalizePackageManagerTabsResult {
  const diagnostics: Diagnostic[] = [];
  let promoted = false;

  const lines = source.split('\n');
  const output: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';

    // Detect start of a ::::tabs block (possibly with {exclusive} attribute).
    if (/^ {0,3}::::tabs(?:\{[^}]*\})?$/.test(line)) {
      const block = collectTabsBlock(lines, i);
      if (block === null) {
        // Malformed block — pass through verbatim.
        output.push(line);
        i += 1;
        continue;
      }

      const pmResult = tryPromotePackageManagerBlock(block.tabs, sourcePath, diagnostics);
      if (pmResult !== null) {
        output.push(...pmResult);
        promoted = true;
        i = block.nextIndex;
      } else {
        // Not a PM block — pass through verbatim.
        output.push(...block.raw);
        i = block.nextIndex;
      }
      continue;
    }

    output.push(line);
    i += 1;
  }

  return { text: output.join('\n'), diagnostics, promoted };
}

interface TabEntry {
  readonly label: string;
  readonly body: string;
}

interface TabsBlock {
  readonly tabs: ReadonlyArray<TabEntry>;
  readonly raw: ReadonlyArray<string>;
  readonly nextIndex: number;
}

/**
 * Collect a `::::tabs ... ::::` block starting at `startIndex`.
 * Returns the parsed tabs and the raw lines for pass-through, or null if
 * the block cannot be fully parsed.
 */
function collectTabsBlock(
  lines: ReadonlyArray<string>,
  startIndex: number,
): TabsBlock | null {
  const raw: string[] = [];
  const tabs: TabEntry[] = [];
  let i = startIndex;

  raw.push(lines[i] ?? '');
  i += 1;

  let currentLabel: string | null = null;
  const currentBody: string[] = [];

  while (i < lines.length) {
    const line = lines[i] ?? '';
    raw.push(line);

    // Closing ::::
    if (/^ {0,3}::::$/.test(line)) {
      if (currentLabel !== null) {
        tabs.push({ label: currentLabel, body: currentBody.join('\n').trim() });
        currentLabel = null;
        currentBody.length = 0;
      }
      i += 1;
      // Consume trailing blank line if present.
      if (i < lines.length && (lines[i] ?? '').trim() === '') {
        raw.push(lines[i] ?? '');
        i += 1;
      }
      return { tabs, raw, nextIndex: i };
    }

    // Opening :::tab[Label]
    const tabMatch = /^ {0,3}:::tab\[([^\]]+)\]$/.exec(line);
    if (tabMatch) {
      if (currentLabel !== null) {
        tabs.push({ label: currentLabel, body: currentBody.join('\n').trim() });
        currentBody.length = 0;
      }
      currentLabel = tabMatch[1] ?? '';
      i += 1;
      continue;
    }

    // Closing ::: for a tab
    if (/^ {0,3}:::$/.test(line)) {
      if (currentLabel !== null) {
        tabs.push({ label: currentLabel, body: currentBody.join('\n').trim() });
        currentLabel = null;
        currentBody.length = 0;
      }
      i += 1;
      continue;
    }

    // Body line
    if (currentLabel !== null) {
      currentBody.push(line);
    }
    i += 1;
  }

  return null; // block wasn't closed
}

/**
 * Check whether all tabs in the block are PM tabs. If so, extract the pkg name
 * and return the replacement lines. Otherwise return null.
 */
function tryPromotePackageManagerBlock(
  tabs: ReadonlyArray<TabEntry>,
  sourcePath: string,
  diagnostics: Diagnostic[],
): ReadonlyArray<string> | null {
  if (tabs.length < 2) return null;

  const labels = tabs.map((t) => t.label.toLowerCase());
  const allPm = labels.every((l) => PM_LABELS.has(l));
  if (!allPm) return null;

  // Try to extract the package name from the npm or pnpm tab body.
  const npmTab = tabs.find((t) => t.label.toLowerCase() === 'npm');
  const pnpmTab = tabs.find((t) => t.label.toLowerCase() === 'pnpm');
  const candidateBody = npmTab?.body ?? pnpmTab?.body ?? tabs[0]?.body ?? '';
  const pkg = extractPackageName(candidateBody);

  if (pkg === null) {
    // Can't extract package — emit diagnostic but leave tabs in place.
    diagnostics.push(
      createDiagnostic({
        severity: 'warning',
        ruleId: 'package-managers-tabs-promoted',
        source: SOURCE,
        message: `Package-manager tab group detected in "${sourcePath}" but the package name could not be extracted from the install command. Falling back to plain <Tabs>. Manually replace with <PackageManagers pkg="your-package"> from starlight-package-managers.`,
      }),
    );
    return null;
  }

  diagnostics.push(
    createDiagnostic({
      severity: 'info',
      ruleId: 'package-managers-tabs-promoted',
      source: SOURCE,
      message: `Package-manager tab group in "${sourcePath}" promoted to <PackageManagers pkg="${pkg}"> (starlight-package-managers).`,
    }),
  );

  return [
    `import { PackageManagers } from 'starlight-package-managers';`,
    '',
    `<PackageManagers pkg="${pkg}" />`,
    '',
  ];
}

function extractPackageName(body: string): string | null {
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    // npm install pkg / npm add pkg / npm i pkg
    const m = /^npm\s+(?:install|add|i)\s+(.+)$/.exec(trimmed);
    if (m?.[1]) {
      const parts = (m[1] as string).split(/\s+/);
      // Find first non-flag argument.
      const pkg = parts.find((p) => p.length > 0 && !p.startsWith('-'));
      if (pkg) return pkg;
    }
  }
  return null;
}
