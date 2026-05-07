/**
 * Test fake for the Prompter port. Scripted answers in, recorded calls out.
 * Returning `null` from any answer simulates Ctrl+C cancellation.
 */

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

export interface ScriptedAnswers {
  text?: ReadonlyArray<string | null>;
  path?: ReadonlyArray<string | null>;
  confirm?: ReadonlyArray<boolean | null>;
  select?: ReadonlyArray<string | null>;
  selectKey?: ReadonlyArray<string | null>;
  multiselect?: ReadonlyArray<ReadonlyArray<string> | null>;
  autocompleteMultiselect?: ReadonlyArray<ReadonlyArray<string> | null>;
}

interface RecordedCall {
  readonly kind: string;
  readonly message: string;
  readonly options?: ReadonlyArray<unknown>;
  readonly initialValue?: unknown;
}

interface RecordedLog {
  readonly level: 'info' | 'success' | 'step' | 'warn' | 'error';
  readonly message: string;
}

interface RecordedNote {
  readonly title: string | undefined;
  readonly body: string;
}

interface RecordedSpinner {
  readonly initialMessage: string;
  readonly messages: ReadonlyArray<string>;
  readonly stoppedWith: string | null;
  readonly erroredWith: string | null;
}

export interface FakePrompter extends Prompter {
  readonly calls: ReadonlyArray<RecordedCall>;
  readonly logs: ReadonlyArray<RecordedLog>;
  readonly notes: ReadonlyArray<RecordedNote>;
  readonly spinners: ReadonlyArray<RecordedSpinner>;
}

export function createFakePrompter(script: ScriptedAnswers = {}): FakePrompter {
  const calls: Array<RecordedCall> = [];
  const logs: Array<RecordedLog> = [];
  const notes: Array<RecordedNote> = [];
  const spinnersImpl: Array<{
    initialMessage: string;
    messages: string[];
    stoppedWith: string | null;
    erroredWith: string | null;
  }> = [];
  const cursors = {
    text: 0,
    path: 0,
    confirm: 0,
    select: 0,
    selectKey: 0,
    multiselect: 0,
    autocompleteMultiselect: 0,
  };

  function next<T>(
    kind:
      | 'text'
      | 'path'
      | 'confirm'
      | 'select'
      | 'selectKey'
      | 'multiselect'
      | 'autocompleteMultiselect',
    fallback: T,
  ): T {
    const list = script[kind] as ReadonlyArray<unknown> | undefined;
    if (list === undefined) return fallback;
    const value = list[cursors[kind]++];
    return value === undefined ? fallback : (value as T);
  }

  const log: Logger = {
    info: (message: string) => {
      logs.push({ level: 'info', message });
    },
    success: (message: string) => {
      logs.push({ level: 'success', message });
    },
    step: (message: string) => {
      logs.push({ level: 'step', message });
    },
    warn: (message: string) => {
      logs.push({ level: 'warn', message });
    },
    error: (message: string) => {
      logs.push({ level: 'error', message });
    },
  };

  return {
    intro: () => {},
    outro: () => {},
    cancel: () => {},
    note: (body: string, title?: string) => {
      notes.push({ title, body });
    },
    log,
    text: async (o: TextOptions) => {
      calls.push({ kind: 'text', message: o.message, initialValue: o.initialValue });
      return next<string | null>('text', o.initialValue ?? '');
    },
    path: async (o: PathOptions) => {
      calls.push({ kind: 'path', message: o.message, initialValue: o.initialValue });
      return next<string | null>('path', o.initialValue ?? '');
    },
    confirm: async (o: ConfirmOptions) => {
      calls.push({ kind: 'confirm', message: o.message, initialValue: o.initialValue });
      return next<boolean | null>('confirm', o.initialValue ?? true);
    },
    select: async <V extends string>(o: SelectOptions<V>) => {
      calls.push({
        kind: 'select',
        message: o.message,
        options: o.options,
        initialValue: o.initialValue,
      });
      return next<V | null>('select', o.initialValue ?? o.options[0]?.value ?? null);
    },
    selectKey: async <V extends string>(o: SelectKeyOptions<V>) => {
      calls.push({
        kind: 'selectKey',
        message: o.message,
        options: o.options,
        initialValue: o.initialValue,
      });
      return next<V | null>('selectKey', o.initialValue ?? o.options[0]?.value ?? null);
    },
    multiselect: async <V extends string>(o: MultiselectOptions<V>) => {
      calls.push({
        kind: 'multiselect',
        message: o.message,
        options: o.options,
        initialValue: o.initialValues,
      });
      return next<ReadonlyArray<V> | null>(
        'multiselect',
        (o.initialValues ?? []) as ReadonlyArray<V>,
      );
    },
    autocompleteMultiselect: async <V extends string>(o: AutocompleteMultiselectOptions<V>) => {
      calls.push({
        kind: 'autocompleteMultiselect',
        message: o.message,
        options: o.options,
        initialValue: o.initialValues,
      });
      return next<ReadonlyArray<V> | null>(
        'autocompleteMultiselect',
        (o.initialValues ?? []) as ReadonlyArray<V>,
      );
    },
    spinner: (o: SpinnerOptions): SpinnerHandle => {
      const record = {
        initialMessage: o.initialMessage,
        messages: [] as string[],
        stoppedWith: null as string | null,
        erroredWith: null as string | null,
      };
      spinnersImpl.push(record);
      return {
        message: (text: string) => {
          record.messages.push(text);
        },
        stop: (text?: string) => {
          record.stoppedWith = text ?? '';
        },
        error: (text?: string) => {
          record.erroredWith = text ?? '';
        },
      };
    },
    get calls() {
      return calls;
    },
    get logs() {
      return logs;
    },
    get notes() {
      return notes;
    },
    get spinners() {
      return spinnersImpl as ReadonlyArray<RecordedSpinner>;
    },
  };
}
