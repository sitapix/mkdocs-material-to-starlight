/**
 * Surface diagnostics for MkDocs `extra:` keys that the converter does not
 * (and structurally cannot) translate.
 *
 * Currently covers two well-documented Material idioms:
 *
 *   - `extra.consent` — Material's cookie consent dialog. Starlight has no
 *     consent-management primitive; recreating it requires a third-party
 *     consent manager wired into `astro.config` `head[]`.
 *
 *   - `extra.status` — Material's per-page lifecycle status badges (`new`,
 *     `deprecated`, etc., declared in `extra.status` and applied via page
 *     frontmatter `status: <key>`). The display-name dictionary has no
 *     direct Starlight equivalent; the closest match is reproducing each
 *     status as a Starlight `<Badge>` placed inline next to the page heading.
 *
 * Pure function: takes the parsed `extras` dict (either the full mkdocs.yml
 * object or just its `extra:` sub-block), returns Diagnostic[]. No I/O.
 * Idempotent: same input → same output.
 */

import {
  createDiagnostic,
  type Diagnostic,
} from '../../domain/diagnostics/diagnostic.js';

const SOURCE = 'detect-features/extra-warnings';

export function detectExtraWarnings(
  extras: Readonly<Record<string, unknown>>,
): ReadonlyArray<Diagnostic> {
  const inner =
    typeof extras.extra === 'object' && extras.extra !== null
      ? (extras.extra as Record<string, unknown>)
      : extras;

  const out: Diagnostic[] = [];
  if (isPlainObject(inner.consent)) {
    out.push(
      createDiagnostic({
        severity: 'warning',
        ruleId: 'extra-consent-no-equivalent',
        source: SOURCE,
        message:
          'mkdocs.yml `extra.consent` (cookie consent dialog) detected. Starlight has no built-in consent manager. Install a third-party library such as `vanilla-cookieconsent` or `klaro`, configure it in a small Astro component, and wire the script into Starlight `head[]`. Alternatively, use a hosted CMP (OneTrust, Cookiebot) and add their snippet via `head[]`.',
      }),
    );
  }
  if (isPlainObject(inner.status)) {
    out.push(
      createDiagnostic({
        severity: 'info',
        ruleId: 'extra-status-no-equivalent',
        source: SOURCE,
        message:
          'mkdocs.yml `extra.status` (per-page lifecycle badges declared as a name dictionary) detected. Starlight has no equivalent dictionary. Reproduce each status by placing a Starlight `<Badge>` inline next to the page heading (the file becomes `.mdx`), or roll your own status field in the docs frontmatter schema and surface it via a custom PageTitle override.',
      }),
    );
  }
  if (isPlainObject(inner.annotate)) {
    const langs = Object.keys(inner.annotate as Record<string, unknown>).join(', ');
    out.push(
      createDiagnostic({
        severity: 'info',
        ruleId: 'extra-annotate-no-equivalent',
        source: SOURCE,
        message:
          `mkdocs.yml \`extra.annotate\` (custom annotation selectors for languages: ${langs}) detected. Starlight code blocks (ExpressiveCode) do not render Material-style popover annotations — the converter already downgrades \`(N)!\` markers to plain \`(N)\` and leaves the trailing list as a numbered legend. Custom selectors have no effect because there are no popovers to attach to. No action required unless you want to reimplement the popover UX as a custom MDX component.`,
      }),
    );
  }

  const analyticsDiag = detectAnalyticsProviderFallback(inner.analytics);
  if (analyticsDiag !== null) out.push(analyticsDiag);

  if (isPlainObject(inner.tags)) {
    out.push(
      createDiagnostic({
        severity: 'info',
        ruleId: 'extra-tags-alias-map',
        source: SOURCE,
        message:
          'mkdocs.yml `extra.tags` (Material\'s tag-name → identifier alias map, paired with `theme.icon.tag.<identifier>` to attach an icon to each tag) detected. The `starlight-tags` plugin (frostybee/starlight-tags) consumes plain-string tags from page frontmatter; it has no equivalent dictionary for assigning per-tag icons. Tags pass through as plain strings; if per-tag icons matter, render them manually inside a custom Tag.astro component using your own slug→icon map.',
      }),
    );
  }

  const versionDiag = detectVersionMetadata(inner.version);
  if (versionDiag !== null) out.push(versionDiag);

  // Sortable tables in MkDocs require pulling in `tablesort` via
  // `extra_javascript`. Starlight has no built-in equivalent; surface the
  // fact that the script reference will be dropped (extra_javascript paths
  // are honoured, but the implicit `document$.subscribe(…)` Material runs
  // is MkDocs-specific and won't fire under Astro).
  const extraJs = extras['extra_javascript'];
  const tsDiag = detectTablesort(extraJs);
  if (tsDiag !== null) out.push(tsDiag);

  return out;
}

/**
 * Material's `extra.version` block carries metadata beyond the bare
 * `provider:` key the converter already auto-routes through to
 * `starlight-versions`. The optional `default:` (default version alias)
 * and `alias: true` (display version aliases beside numbers) are honored
 * by `mike` but have no equivalent declarative `starlight-versions` config
 * — both are reflected by the user's actual `versions: [{ slug, label }]`
 * array in `astro.config`. Surface the values so users can hand-port them.
 */
function detectVersionMetadata(version: unknown): Diagnostic | null {
  if (!isPlainObject(version)) return null;
  const def = typeof version['default'] === 'string' ? (version['default'] as string) : null;
  const alias = version['alias'] === true;
  if (def === null && !alias) return null;
  const parts: string[] = [];
  if (def !== null) parts.push(`default: "${def}"`);
  if (alias) parts.push('alias: true');
  return createDiagnostic({
    severity: 'info',
    ruleId: 'extra-version-metadata',
    source: SOURCE,
    message:
      `mkdocs.yml \`extra.version\` carries metadata beyond \`provider:\` (${parts.join(', ')}). ` +
      `\`starlight-versions\` does not have a declarative \`default\` / \`alias\` field — both are reflected through your actual \`versions: [...]\` array in \`astro.config\`. ` +
      `For \`default:\`, mark the matching version entry as the canonical one (typically the first item, or the only one without a date suffix). ` +
      `For \`alias: true\`, set each version's \`label\` to "<slug> (<alias>)" so the dropdown shows both.`,
  });
}

function detectTablesort(extraJs: unknown): Diagnostic | null {
  if (!Array.isArray(extraJs)) return null;
  const sources = extraJs
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as { path?: unknown }).path === 'string'
      ) {
        return (entry as { path: string }).path;
      }
      return '';
    })
    .filter((s) => s.length > 0);
  const matches = sources.filter((s) => /tablesort/i.test(s));
  if (matches.length === 0) return null;
  return createDiagnostic({
    severity: 'info',
    ruleId: 'tablesort-detected',
    source: SOURCE,
    message:
      'mkdocs.yml `extra_javascript` references `tablesort` — Material\'s recommended approach for sortable tables. The script reference is preserved in your Astro site, but Material wires `tablesort` via a `document$.subscribe(...)` block that does not fire under Astro/Starlight. To restore sortable tables: add an Astro client script (e.g. `<script>` tag in a custom Layout override) that runs `new Tablesort(table)` on every `<table>` after page load. Alternatively, accept the loss — most documentation tables do not need sorting.',
  });
}

/**
 * Material's `extra.analytics` block accepts a `provider:` key. The
 * `analytics-mapping` module already auto-wires the `google` provider into
 * Starlight `head[]`. For non-google providers (plausible, GTM, custom),
 * surface a recommendation to the closest community Starlight plugin so the
 * user has a clear migration target. Returns null when no usable provider
 * key is set or the provider is `google` (already handled).
 */
function detectAnalyticsProviderFallback(
  analytics: unknown,
): Diagnostic | null {
  if (!isPlainObject(analytics)) return null;
  const provider = analytics.provider;
  if (typeof provider !== 'string') return null;
  if (provider === 'google') return null;

  const lower = provider.toLowerCase();
  if (lower === 'plausible') {
    return createDiagnostic({
      severity: 'info',
      ruleId: 'extra-analytics-provider-recommended',
      source: SOURCE,
      message:
        'mkdocs.yml `extra.analytics.provider: plausible` detected — Starlight has no built-in Plausible integration but the community plugin `starlight-plausible` (jakebellacera/starlight-plausible) configures it in one line. Install it, drop the script tag, and pass your domain via the plugin\'s options.',
    });
  }
  if (lower === 'gtm' || lower === 'tag-manager' || lower === 'google-tag-manager') {
    return createDiagnostic({
      severity: 'info',
      ruleId: 'extra-analytics-provider-recommended',
      source: SOURCE,
      message:
        'mkdocs.yml `extra.analytics.provider: ' + provider + '` detected — for Google Tag Manager use the community plugin `starlight-gtm` (jbend/starlight-gtm). Install it and pass your container ID via the plugin\'s options.',
    });
  }
  return createDiagnostic({
    severity: 'warning',
    ruleId: 'extra-analytics-provider-recommended',
    source: SOURCE,
    message:
      'mkdocs.yml `extra.analytics.provider: ' + provider + '` detected — Starlight has no plugin for this provider and the converter only auto-wires Google Analytics. Add the provider\'s tracking script manually to your Starlight `head[]` config.',
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}
