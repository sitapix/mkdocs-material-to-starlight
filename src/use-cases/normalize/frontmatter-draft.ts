/** Mark a converted MkDocs draft with Starlight's `draft: true` frontmatter. */

export function markFrontmatterDraft(source: string): string {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(/\r?\n/);

  if (lines[0]?.trim() !== '---') {
    return `---${newline}draft: true${newline}---${newline}${newline}${source}`;
  }

  const closingIndex = lines.findIndex(
    (line, index) => index > 0 && (line.trim() === '---' || line.trim() === '...'),
  );
  if (closingIndex < 0) {
    return `---${newline}draft: true${newline}---${newline}${newline}${source}`;
  }

  const draftIndex = lines.findIndex(
    (line, index) => index > 0 && index < closingIndex && /^draft\s*:/.test(line),
  );
  if (draftIndex >= 0) {
    lines[draftIndex] = 'draft: true';
  } else {
    lines.splice(1, 0, 'draft: true');
  }
  return lines.join(newline);
}
