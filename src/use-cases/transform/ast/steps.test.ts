import { describe, expect, it } from 'vitest';
import { promoteSteps } from './steps.js';

describe('promoteSteps', () => {
  describe('positive — promotes qualifying ordered lists', () => {
    const TUTORIAL_SOURCE = [
      '# Getting Started',
      '',
      '## Installation Steps',
      '',
      '1. Install the package',
      '',
      '   Run the following command:',
      '',
      '   ```bash',
      '   npm install mylib',
      '   ```',
      '',
      '2. Configure your project',
      '',
      '   Edit `config.js`:',
      '',
      '   ```js',
      '   module.exports = { key: "value" };',
      '   ```',
      '',
      '3. Run the development server',
      '',
      '   Start with:',
      '',
      '   ```bash',
      '   npm start',
      '   ```',
      '',
      '4. Open your browser',
      '',
      '   Navigate to `http://localhost:3000`.',
      '',
    ].join('\n');

    it('wraps qualifying ordered list in <Steps>', () => {
      const result = promoteSteps(TUTORIAL_SOURCE);
      expect(result.promoted).toBe(true);
      expect(result.text).toContain('<Steps>');
      expect(result.text).toContain('</Steps>');
    });

    it('includes the ordered list inside the <Steps> wrapper', () => {
      const result = promoteSteps(TUTORIAL_SOURCE);
      expect(result.text).toContain('1. Install the package');
      expect(result.text).toContain('2. Configure your project');
      expect(result.text).toContain('3. Run the development server');
    });

    it('emits a diagnostic', () => {
      const result = promoteSteps(TUTORIAL_SOURCE);
      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(result.diagnostics[0]?.ruleId).toBe('ordered-list-promoted-to-steps');
    });

    it('promotes when heading contains "tutorial"', () => {
      const src = [
        '## Tutorial',
        '',
        '1. First step',
        '',
        '   Some explanation here.',
        '',
        '2. Second step',
        '',
        '   Another explanation.',
        '',
        '3. Third step',
        '',
        '   Final explanation.',
        '',
      ].join('\n');
      const result = promoteSteps(src);
      expect(result.promoted).toBe(true);
    });

    it('promotes when heading starts with "Setup"', () => {
      const src = [
        '## Setup Your Environment',
        '',
        '1. Install dependencies',
        '',
        '   Run npm install.',
        '',
        '2. Configure settings',
        '',
        '   Edit config file.',
        '',
        '3. Start the server',
        '',
        '   Run npm start.',
        '',
      ].join('\n');
      const result = promoteSteps(src);
      expect(result.promoted).toBe(true);
    });
  });

  describe('negative — does NOT promote', () => {
    it('does NOT promote when there are fewer than 3 items', () => {
      const src = [
        '## Installation Steps',
        '',
        '1. First step',
        '',
        '   Explanation.',
        '',
        '2. Second step',
        '',
        '   Explanation.',
        '',
      ].join('\n');
      const result = promoteSteps(src);
      expect(result.promoted).toBe(false);
    });

    it('does NOT promote single-line items (no multi-paragraph content)', () => {
      const src = [
        '## Installation Steps',
        '',
        '1. Do this',
        '2. Then that',
        '3. Finally this',
        '',
      ].join('\n');
      const result = promoteSteps(src);
      expect(result.promoted).toBe(false);
    });

    it('does NOT promote when no tutorial-style heading precedes the list', () => {
      const src = [
        '## Notes',
        '',
        '1. First item',
        '',
        '   Some content.',
        '',
        '2. Second item',
        '',
        '   More content.',
        '',
        '3. Third item',
        '',
        '   Even more.',
        '',
      ].join('\n');
      const result = promoteSteps(src);
      expect(result.promoted).toBe(false);
    });

    it('inserts a blank line before `</Steps>` so the closer outdents from the list', () => {
      // Real-world DDEV regression: `users/topics/sharing.md` ends a numbered
      // tutorial list with `</Steps>` directly after the last item's body.
      // Without a blank line, CommonMark parses `</Steps>` as belonging to
      // the last list item — remark-stringify then re-emits it indented at
      // the item's continuation column, and MDX rejects the misaligned
      // closing tag with `Expected the closing tag </Steps> ...`.
      const src = [
        '## Setup Steps',
        '',
        '1. **First:**',
        '',
        '   ```bash',
        '   first cmd',
        '   ```',
        '',
        '2. **Second:**',
        '',
        '   ```bash',
        '   second cmd',
        '   ```',
        '',
        '3. **Third:**',
        '',
        '   ```bash',
        '   third cmd',
        '   ```',
        '',
        '   Trailing prose for item 3.',
        '',
        '## Next section',
        '',
      ].join('\n');
      const result = promoteSteps(src);
      expect(result.promoted).toBe(true);
      // The closer must sit on its own line, with a blank line separating
      // it from the last list-item content. Both lines must be at column 0.
      expect(result.text).toMatch(/Trailing prose for item 3\.\n\n<\/Steps>/);
    });

    it('is idempotent — does not double-wrap if <Steps> already present', () => {
      const src = [
        '## Installation Steps',
        '',
        '<Steps>',
        '',
        '1. First step',
        '',
        '   Content.',
        '',
        '2. Second step',
        '',
        '   Content.',
        '',
        '3. Third step',
        '',
        '   Content.',
        '',
        '</Steps>',
        '',
      ].join('\n');
      const result = promoteSteps(src);
      expect(result.promoted).toBe(false);
      expect(result.text).toBe(src);
    });
  });
});
