/**
 * Build the diagnostic stream describing how `theme.features` flags,
 * `copyright`, `repo_url`, `theme.icon.*` overrides, and `theme.direction`
 * map to Starlight equivalents (or, where there is none, the manual
 * remediation path).
 *
 * Pure: takes already-parsed config fragments + a list of theme features,
 * returns a diagnostic array.
 */

import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';
import { classifyThemeFeature } from '../../domain/starlight/theme-feature-catalog.js';

const SOURCE = 'mkdocs-material-to-starlight';

export interface TaggedDiagnostic {
  readonly sourcePath: string;
  readonly diagnostic: Diagnostic;
}

export interface DiagnoseThemeFeaturesInput {
  readonly hasTabsLink: boolean;
  readonly hasNavigationTabs: boolean;
  readonly themeFeatures: ReadonlyArray<string>;
  readonly copyright: string | null;
  readonly repoUrl: string | null;
  readonly repoName: string | null;
  readonly themeOptions: Readonly<Record<string, unknown>>;
}

export function diagnoseThemeFeatures(
  input: DiagnoseThemeFeaturesInput,
): ReadonlyArray<TaggedDiagnostic> {
  const out: TaggedDiagnostic[] = [];

  if (input.hasTabsLink) {
    out.push({
      sourcePath: 'mkdocs.yml',
      diagnostic: createDiagnostic({
        severity: 'info',
        ruleId: 'feature-tabs-link-detected',
        source: SOURCE,
        message:
          "theme.features `content.tabs.link` detected. Generated `<Tabs>` components include a derived `syncKey` so identically-labelled tab groups stay synchronised across pages, matching Material's behaviour.",
      }),
    });
  }

  if (input.copyright !== null) {
    out.push({
      sourcePath: 'mkdocs.yml',
      diagnostic: createDiagnostic({
        severity: 'info',
        ruleId: 'copyright-text-detected',
        source: SOURCE,
        message: `mkdocs.yml \`copyright:\` text detected: "${input.copyright}". Starlight has no first-class \`copyright\` config option. Recreate by overriding Footer.astro under \`src/components/overrides/\` with the supplied text rendered inside a \`<footer class="sl-flex">\` block, then register the override via Starlight \`components: { Footer: "./src/components/overrides/Footer.astro" }\`.`,
      }),
    });
  }

  if (input.repoUrl !== null) {
    const repoName = input.repoName ?? '(host inferred from URL)';
    out.push({
      sourcePath: 'mkdocs.yml',
      diagnostic: createDiagnostic({
        severity: 'info',
        ruleId: 'repo-button-recommendation',
        source: SOURCE,
        message: `mkdocs.yml \`repo_url\` is set${input.repoName !== null ? ` (repo_name: "${repoName}")` : ''}. The converter wires the URL into starlight \`editLink.baseUrl\`, but does not auto-synthesise a header repo-button — Starlight surfaces repo links via the \`social: [...]\` config. To match Material's repo button, add an entry like \`{ icon: "github", label: "${input.repoName ?? 'GitHub'}", href: "${input.repoUrl}" }\` to your starlight \`social\` array in astro.config (skip if you already added the same entry to mkdocs.yml's \`extra.social[]\`).`,
      }),
    });
  }

  // theme.icon.* overrides — Material lets users swap UI chrome icons
  // (menu/search/repo/edit/etc.) and per-admonition / per-tag icons.
  // Starlight uses its own icon catalog and slot mechanism; most overrides
  // must be reproduced via component overrides or per-occurrence props.
  const themeIcons = extractObjectOption(input.themeOptions, 'icon');
  if (themeIcons !== null && Object.keys(themeIcons).length > 0) {
    const keys = Object.keys(themeIcons).sort().join(', ');
    out.push({
      sourcePath: 'mkdocs.yml',
      diagnostic: createDiagnostic({
        severity: 'info',
        ruleId: 'theme-icon-overrides-detected',
        source: SOURCE,
        message: `mkdocs.yml \`theme.icon\` overrides detected (${keys}). Starlight has its own icon catalog and slot system; UI-chrome icons (menu/search/repo/edit/view/previous/next/top/close) cannot be remapped via config. \`theme.icon.admonition.<type>\` overrides should be reproduced per-aside via \`<Aside icon="…">\`. \`theme.icon.tag.<id>\` overrides require a custom Tag.astro component (see \`extra-tags-alias-map\` diagnostic). \`theme.icon.logo\` is honoured if you set \`logo: { src }\` in starlight() — pass an SVG asset.`,
      }),
    });
  }

  const themeDirection = extractStringOption(input.themeOptions, 'direction');
  if (themeDirection?.toLowerCase() === 'rtl') {
    out.push({
      sourcePath: 'mkdocs.yml',
      diagnostic: createDiagnostic({
        severity: 'info',
        ruleId: 'theme-direction-rtl',
        source: SOURCE,
        message:
          "theme.direction `rtl` detected. Add `dir: 'rtl'` to the relevant Starlight `locales: { <code>: { label, lang, dir: 'rtl' } }` entry so the layout flips for right-to-left languages. Starlight has no top-level direction switch — the setting is per-locale.",
      }),
    });
  }

  if (input.hasNavigationTabs) {
    out.push({
      sourcePath: 'mkdocs.yml',
      diagnostic: createDiagnostic({
        severity: 'info',
        ruleId: 'feature-navigation-tabs-recommend-topics',
        source: SOURCE,
        message:
          'theme.features `navigation.tabs` detected. Install `starlight-sidebar-topics` and split the generated sidebar into one topic per top-level group for the equivalent UX.',
      }),
    });
  }

  for (const feature of input.themeFeatures) {
    const classification = classifyThemeFeature(feature);
    if (classification === null) {
      out.push({
        sourcePath: 'mkdocs.yml',
        diagnostic: createDiagnostic({
          severity: 'warning',
          ruleId: 'theme-feature-unknown',
          source: SOURCE,
          message: `theme.features \`${feature}\` was not recognized as a Material feature flag — typo or post-catalog addition.`,
        }),
      });
      continue;
    }
    if (classification.kind === 'handled-elsewhere') continue;
    out.push({
      sourcePath: 'mkdocs.yml',
      diagnostic: createDiagnostic({
        severity: classification.kind === 'unsupported' ? 'warning' : 'info',
        ruleId:
          classification.kind === 'unsupported'
            ? 'theme-feature-unsupported'
            : 'theme-feature-replaced',
        source: SOURCE,
        message: `theme.features \`${feature}\`: ${classification.note}`,
      }),
    });
  }

  return out;
}

function extractObjectOption(
  options: Readonly<Record<string, unknown>>,
  key: string,
): Record<string, unknown> | null {
  const v = options[key];
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function extractStringOption(
  options: Readonly<Record<string, unknown>>,
  key: string,
): string | null {
  const v = options[key];
  return typeof v === 'string' ? v : null;
}
