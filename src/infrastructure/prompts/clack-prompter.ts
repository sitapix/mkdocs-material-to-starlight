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
 */

import {
  intro as clackIntro,
  outro as clackOutro,
  note as clackNote,
  text as clackText,
  confirm as clackConfirm,
  select as clackSelect,
  multiselect as clackMultiselect,
  isCancel,
} from '@clack/prompts';
import pc from 'picocolors';
import type {
  ConfirmOptions,
  MultiselectOptions,
  Prompter,
  SelectOptions,
  TextOptions,
} from '../../domain/wizard/ports/prompter.js';

export function createClackPrompter(): Prompter {
  return {
    intro: (title: string) => clackIntro(pc.bgCyan(pc.black(` ${title} `))),
    outro: (message: string) => clackOutro(message),
    note: (body: string, title?: string) => clackNote(body, title),
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
        clackOptions.validate = o.validate;
      }
      const result = await clackText(clackOptions);
      return isCancel(result) ? null : (result as string);
    },
    confirm: async (o: ConfirmOptions) => {
      const clackOptions: Parameters<typeof clackConfirm>[0] = {
        message: o.message,
      };
      if (o.initialValue !== undefined) {
        clackOptions.initialValue = o.initialValue;
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
      const result = await clackSelect(clackOptions);
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
      const result = await clackMultiselect(clackOptions);
      return isCancel(result) ? null : (result as ReadonlyArray<V>);
    },
  };
}
