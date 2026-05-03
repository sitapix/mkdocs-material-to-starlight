import { describe, expect, it } from 'vitest';
import { detectLandingPage } from './landing-page.js';

const HERO_IMAGE_PAGE = [
  '---',
  'title: My Project',
  '---',
  '',
  '![Logo](images/logo.svg)',
  '',
  '# My Project',
  '',
  '## The fast, modern framework',
  '',
  '[Get Started](getting-started.md){ .md-button .md-button--primary }',
  '[Learn More](guide.md){ .md-button }',
  '',
  '<div class="grid cards" markdown>',
  '',
  '-   :material-rocket: **Fast**',
  '',
  '    Blazing fast performance.',
  '',
  '-   :material-shield: **Secure**',
  '',
  '    Security first.',
  '',
  '-   :material-cog: **Configurable**',
  '',
  '    Highly configurable.',
  '',
  '-   :material-heart: **Supported**',
  '',
  '    Active community.',
  '',
  '</div>',
  '',
].join('\n');

describe('detectLandingPage', () => {
  describe('detection — positive cases', () => {
    it('detects a landing page with hero image + CTA buttons + feature grid', () => {
      const result = detectLandingPage(HERO_IMAGE_PAGE, 'index.md');
      expect(result.isLanding).toBe(true);
    });

    it('emits template: splash in frontmatter', () => {
      const result = detectLandingPage(HERO_IMAGE_PAGE, 'index.md');
      expect(result.text).toContain('template: splash');
    });

    it('emits hero.title from the H1', () => {
      const result = detectLandingPage(HERO_IMAGE_PAGE, 'index.md');
      expect(result.text).toContain('title: My Project');
    });

    it('emits hero.tagline from the H2', () => {
      const result = detectLandingPage(HERO_IMAGE_PAGE, 'index.md');
      expect(result.text).toContain('tagline: The fast, modern framework');
    });

    it('emits hero.image.file from the hero image', () => {
      const result = detectLandingPage(HERO_IMAGE_PAGE, 'index.md');
      expect(result.text).toContain('file: images/logo.svg');
    });

    it('emits hero.actions with the first action as primary', () => {
      const result = detectLandingPage(HERO_IMAGE_PAGE, 'index.md');
      expect(result.text).toContain('variant: primary');
      expect(result.text).toContain('text: Get Started');
      expect(result.text).toContain('link: getting-started.md');
    });

    it('emits subsequent actions as secondary', () => {
      const result = detectLandingPage(HERO_IMAGE_PAGE, 'index.md');
      expect(result.text).toContain('variant: secondary');
    });

    it('preserves the grid cards in the body', () => {
      const result = detectLandingPage(HERO_IMAGE_PAGE, 'index.md');
      expect(result.text).toContain('<div class="grid cards"');
    });
  });

  describe('detection — negative cases', () => {
    it('does NOT detect a non-root index.md', () => {
      const result = detectLandingPage(HERO_IMAGE_PAGE, 'guides/index.md');
      expect(result.isLanding).toBe(false);
      expect(result.text).toBe(HERO_IMAGE_PAGE);
    });

    it('does NOT detect a plain paragraph index.md', () => {
      const plain = [
        '---',
        'title: Home',
        '---',
        '',
        '# Welcome',
        '',
        'This is a simple page with no landing features.',
        '',
        'Another paragraph here.',
        '',
      ].join('\n');
      const result = detectLandingPage(plain, 'index.md');
      expect(result.isLanding).toBe(false);
      expect(result.text).toBe(plain);
    });

    it('is idempotent — does not re-transform a page that already has template: splash', () => {
      const already = [
        '---',
        'title: Home',
        'template: splash',
        'hero:',
        '  title: Welcome',
        '---',
        '',
        '# Welcome',
        '',
        '![Logo](logo.svg)',
        '',
      ].join('\n');
      const result = detectLandingPage(already, 'index.md');
      expect(result.isLanding).toBe(false);
      expect(result.text).toBe(already);
    });

    it('does NOT detect a non-index.md path', () => {
      const result = detectLandingPage(HERO_IMAGE_PAGE, 'about.md');
      expect(result.isLanding).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('detects page with only a hero image (no grid, no CTA)', () => {
      const imageOnly = [
        '---',
        'title: Home',
        '---',
        '',
        '![Project Logo](logo.png)',
        '',
        'Some introductory text.',
        '',
      ].join('\n');
      const result = detectLandingPage(imageOnly, 'index.md');
      expect(result.isLanding).toBe(true);
      expect(result.text).toContain('template: splash');
    });

    it('detects page with feature grid containing ≥3 items (no image)', () => {
      const gridOnly = [
        '---',
        'title: Home',
        '---',
        '',
        '# Welcome',
        '',
        '<div class="grid cards" markdown>',
        '',
        '-   Feature A',
        '-   Feature B',
        '-   Feature C',
        '',
        '</div>',
        '',
      ].join('\n');
      const result = detectLandingPage(gridOnly, 'index.md');
      expect(result.isLanding).toBe(true);
    });

    it('does NOT detect a page with a grid having fewer than 3 items', () => {
      const smallGrid = [
        '---',
        'title: Home',
        '---',
        '',
        '# Welcome',
        '',
        '<div class="grid cards" markdown>',
        '',
        '-   Feature A',
        '-   Feature B',
        '',
        '</div>',
        '',
      ].join('\n');
      const result = detectLandingPage(smallGrid, 'index.md');
      expect(result.isLanding).toBe(false);
    });
  });
});
