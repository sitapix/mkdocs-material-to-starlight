/**
 * Compute the pages starlight-sidebar-topics must `exclude` because no
 * topic can claim them.
 *
 * Topic membership works through sidebar items: slug entries claim their
 * exact page, autogenerate entries claim everything under their directory.
 * MkDocs converts EVERY docs file, listed in `nav:` or not — and the plugin
 * hard-errors on any page it cannot associate with a topic ("Failed to
 * find the topic for the `X` page", field-tested on typer's unlisted
 * `environment-variables` page, 2026-07-23). The converter knows the full
 * page set (the slug map), so the exclusion is computed exactly instead of
 * asking users to hand-maintain globs.
 *
 * Pure: takes the sidebar tree and every emitted slug, returns the slugs
 * no topic claims. The root page ('') is NOT returned — its slug cannot be
 * referenced in a sidebar at all, so the emitter always excludes '/'
 * unconditionally.
 */

import type { SidebarEntry } from '../../domain/starlight/sidebar.js';

export function computeUnclaimedSlugs(
  sidebar: ReadonlyArray<SidebarEntry>,
  allSlugs: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const exact = new Set<string>();
  const prefixes: string[] = [];
  collect(sidebar, exact, prefixes);
  return allSlugs.filter(
    (slug) => slug !== '' && !exact.has(slug) && !prefixes.some((p) => slug.startsWith(p)),
  );
}

function collect(
  entries: ReadonlyArray<SidebarEntry>,
  exact: Set<string>,
  prefixes: string[],
): void {
  for (const entry of entries) {
    switch (entry.kind) {
      case 'slug':
        exact.add(entry.slug);
        break;
      case 'auto':
        prefixes.push(`${entry.directory}/`);
        // The directory's own index page resolves to the bare directory slug.
        exact.add(entry.directory);
        break;
      case 'group':
        collect(entry.items, exact, prefixes);
        break;
      case 'link':
        break;
    }
  }
}
