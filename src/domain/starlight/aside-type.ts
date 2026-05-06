/**
 * Starlight aside types — the four built-in variants.
 *
 * Reference: https://starlight.astro.build/components/asides/
 */

const STARLIGHT_ASIDE_TYPES = ['note', 'tip', 'caution', 'danger'] as const;

export type StarlightAsideType = (typeof STARLIGHT_ASIDE_TYPES)[number];
