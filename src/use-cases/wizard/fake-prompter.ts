/**
 * Test fake for the Prompter port. Scripted answers in, recorded calls out.
 * Returning `null` from any answer simulates Ctrl+C cancellation.
 */

import type {
  ConfirmOptions,
  MultiselectOptions,
  Prompter,
  SelectOptions,
  TextOptions,
} from '../../domain/wizard/ports/prompter.js';

export interface ScriptedAnswers {
  text?: ReadonlyArray<string | null>;
  confirm?: ReadonlyArray<boolean | null>;
  select?: ReadonlyArray<string | null>;
  multiselect?: ReadonlyArray<ReadonlyArray<string> | null>;
}

export interface FakePrompter extends Prompter {
  readonly calls: ReadonlyArray<{ kind: string; message: string }>;
}

export function createFakePrompter(script: ScriptedAnswers = {}): FakePrompter {
  const calls: Array<{ kind: string; message: string }> = [];
  const cursors = { text: 0, confirm: 0, select: 0, multiselect: 0 };

  function next<T>(
    kind: 'text' | 'confirm' | 'select' | 'multiselect',
    fallback: T,
  ): T {
    const list = script[kind] as ReadonlyArray<unknown> | undefined;
    if (list === undefined) return fallback;
    const value = list[cursors[kind]++];
    return value === undefined ? fallback : (value as T);
  }

  return {
    intro: () => {},
    outro: () => {},
    note: () => {},
    text: async (o: TextOptions) => {
      calls.push({ kind: 'text', message: o.message });
      return next<string | null>('text', o.initialValue ?? '');
    },
    confirm: async (o: ConfirmOptions) => {
      calls.push({ kind: 'confirm', message: o.message });
      return next<boolean | null>('confirm', o.initialValue ?? true);
    },
    select: async <V extends string>(o: SelectOptions<V>) => {
      calls.push({ kind: 'select', message: o.message });
      return next<V | null>('select', o.initialValue ?? o.options[0]!.value);
    },
    multiselect: async <V extends string>(o: MultiselectOptions<V>) => {
      calls.push({ kind: 'multiselect', message: o.message });
      return next<ReadonlyArray<V> | null>(
        'multiselect',
        (o.initialValues ?? []) as ReadonlyArray<V>,
      );
    },
    get calls() {
      return calls;
    },
  };
}
