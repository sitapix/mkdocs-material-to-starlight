/**
 * @clack/prompts adapter implementing the Prompter port.
 *
 * Cancellation: every clack helper returns a special symbol (detected via
 * `isCancel`) on Ctrl+C; we map it to `null` per the Prompter contract.
 *
 * Lazy-loadable: this module imports @clack/prompts at module load. Callers
 * who don't enter the wizard branch must not import this module — the launcher
 * uses dynamic `await import('./clack-prompter.js')` to keep the cold path
 * free of clack/picocolors cost.
 *
 * Color choices: the intro banner uses bgCyan + black foreground. Cyan is one
 * of the safer hues for color-vision deficiency (it sits well clear of the
 * red/green axis that protan/deutan users struggle with). Clack itself draws
 * its prompt status with both color AND a distinct unicode glyph (✓ for
 * success, ▲ for warn, ■ for error, ◆ for active prompt), so users who can't
 * distinguish the colors can still distinguish the levels by shape.
 *
 * Settings: we call `updateSettings` once at module load to register vim-style
 * key aliases (j/k for down/up). This is opt-in convenience for vim users and
 * doesn't take anything away from arrow-key users — clack accepts both.
 */

import {
  intro as clackIntro,
  outro as clackOutro,
  cancel as clackCancel,
  note as clackNote,
  text as clackText,
  path as clackPath,
  confirm as clackConfirm,
  select as clackSelect,
  selectKey as clackSelectKey,
  multiselect as clackMultiselect,
  autocompleteMultiselect as clackAutocompleteMultiselect,
  spinner as clackSpinner,
  log as clackLog,
  isCancel,
  updateSettings,
} from '@clack/prompts';
import pc from 'picocolors';
import type {
  AutocompleteMultiselectOptions,
  ConfirmOptions,
  Logger,
  MultiselectOptions,
  PathOptions,
  Prompter,
  SelectKeyOptions,
  SelectOptions,
  SpinnerHandle,
  SpinnerOptions,
  TextOptions,
} from '../../domain/wizard/ports/prompter.js';

// Vim-style aliases. j/k are universally recognized as down/up; this is the
// only navigation customisation we make. h/l for left/right would conflict
// with backspace/forward in text inputs, so we don't add them.
updateSettings({
  aliases: {
    j: 'down',
    k: 'up',
  },
});

const log: Logger = {
  info: (message: string) => clackLog.info(message),
  success: (message: string) => clackLog.success(message),
  step: (message: string) => clackLog.step(message),
  warn: (message: string) => clackLog.warn(message),
  error: (message: string) => clackLog.error(message),
};

export function createClackPrompter(): Prompter {
  return {
    intro: (title: string) => clackIntro(pc.bgCyan(pc.black(` ${title} `))),
    outro: (message: string) => clackOutro(message),
    cancel: (message: string) => clackCancel(message),
    note: (body: string, title?: string) => clackNote(body, title),
    log,
    text: async (o: TextOptions) => {
      const clackOptions: Parameters<typeof clackText>[0] = {
        message: o.message,
      };
      if (o.initialValue !== undefined) {
        clackOptions.initialValue = o.initialValue;
      }
      if (o.placeholder !== undefined) {
        clackOptions.placeholder = o.placeholder;
      }
      if (o.validate !== undefined) {
        const validate = o.validate;
        clackOptions.validate = (value: string | undefined) =>
          validate(value ?? '');
      }
      const result = await clackText(clackOptions);
      return isCancel(result) ? null : (result as string);
    },
    path: async (o: PathOptions) => {
      const clackOptions: Parameters<typeof clackPath>[0] = {
        message: o.message,
      };
      if (o.initialValue !== undefined) {
        clackOptions.initialValue = o.initialValue;
      }
      if (o.directory === true) {
        clackOptions.directory = true;
      }
      if (o.validate !== undefined) {
        const validate = o.validate;
        clackOptions.validate = (value: string | undefined) =>
          validate(value ?? '');
      }
      const result = await clackPath(clackOptions);
      return isCancel(result) ? null : (result as string);
    },
    confirm: async (o: ConfirmOptions) => {
      const clackOptions: Parameters<typeof clackConfirm>[0] = {
        message: o.message,
      };
      if (o.initialValue !== undefined) {
        clackOptions.initialValue = o.initialValue;
      }
      if (o.active !== undefined) {
        clackOptions.active = o.active;
      }
      if (o.inactive !== undefined) {
        clackOptions.inactive = o.inactive;
      }
      const result = await clackConfirm(clackOptions);
      return isCancel(result) ? null : (result as boolean);
    },
    select: async <V extends string>(o: SelectOptions<V>) => {
      const clackOptions: Parameters<typeof clackSelect>[0] = {
        message: o.message,
        options: Array.from(o.options) as Array<{ value: V; label: string; hint?: string }>,
      };
      if (o.initialValue !== undefined) {
        clackOptions.initialValue = o.initialValue;
      }
      if (o.maxItems !== undefined) {
        clackOptions.maxItems = o.maxItems;
      }
      const result = await clackSelect(clackOptions);
      return isCancel(result) ? null : (result as V);
    },
    selectKey: async <V extends string>(o: SelectKeyOptions<V>) => {
      const clackOptions: Parameters<typeof clackSelectKey>[0] = {
        message: o.message,
        options: Array.from(o.options) as Array<{ value: V; label: string; hint?: string }>,
      };
      if (o.initialValue !== undefined) {
        clackOptions.initialValue = o.initialValue;
      }
      const result = await clackSelectKey(clackOptions);
      return isCancel(result) ? null : (result as V);
    },
    multiselect: async <V extends string>(o: MultiselectOptions<V>) => {
      const clackOptions: Parameters<typeof clackMultiselect>[0] = {
        message: o.message,
        options: Array.from(o.options) as Array<{ value: V; label: string; hint?: string }>,
      };
      if (o.initialValues !== undefined) {
        clackOptions.initialValues = Array.from(o.initialValues) as V[];
      }
      if (o.required !== undefined) {
        clackOptions.required = o.required;
      }
      if (o.cursorAt !== undefined) {
        clackOptions.cursorAt = o.cursorAt;
      }
      if (o.maxItems !== undefined) {
        clackOptions.maxItems = o.maxItems;
      }
      const result = await clackMultiselect(clackOptions);
      return isCancel(result) ? null : (result as ReadonlyArray<V>);
    },
    autocompleteMultiselect: async <V extends string>(
      o: AutocompleteMultiselectOptions<V>,
    ) => {
      const clackOptions: Parameters<typeof clackAutocompleteMultiselect>[0] = {
        message: o.message,
        options: Array.from(o.options) as Array<{ value: V; label: string; hint?: string }>,
      };
      if (o.initialValues !== undefined) {
        clackOptions.initialValues = Array.from(o.initialValues) as V[];
      }
      if (o.required !== undefined) {
        clackOptions.required = o.required;
      }
      if (o.maxItems !== undefined) {
        clackOptions.maxItems = o.maxItems;
      }
      if (o.placeholder !== undefined) {
        clackOptions.placeholder = o.placeholder;
      }
      const result = await clackAutocompleteMultiselect(clackOptions);
      return isCancel(result) ? null : (result as ReadonlyArray<V>);
    },
    spinner: (o: SpinnerOptions): SpinnerHandle => {
      const s = clackSpinner({ indicator: o.indicator ?? 'dots' });
      s.start(o.initialMessage);
      return {
        message: (text: string) => s.message(text),
        stop: (text?: string) => s.stop(text),
        error: (text?: string) => s.error(text),
      };
    },
  };
}
