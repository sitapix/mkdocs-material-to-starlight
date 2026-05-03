/**
 * Prompter port — the abstract surface the wizard orchestrator drives.
 * Implementations live in `infrastructure/prompts/`.
 *
 * Methods return `null` to signal user cancellation (Ctrl+C). The orchestrator
 * translates `null` to `Result.err(WIZARD_CANCELLED)`.
 *
 * No method throws on cancellation. Implementations swallow errors and return
 * `null`; programmer errors (invalid option shape) may still throw.
 */

export interface SelectChoice<V extends string> {
  readonly value: V;
  readonly label: string;
  readonly hint?: string;
}

export interface TextOptions {
  readonly message: string;
  readonly initialValue?: string;
  readonly placeholder?: string;
  readonly validate?: (value: string) => string | undefined;
}

export interface ConfirmOptions {
  readonly message: string;
  readonly initialValue?: boolean;
}

export interface SelectOptions<V extends string> {
  readonly message: string;
  readonly options: ReadonlyArray<SelectChoice<V>>;
  readonly initialValue?: V;
}

export interface MultiselectOptions<V extends string> {
  readonly message: string;
  readonly options: ReadonlyArray<SelectChoice<V>>;
  readonly initialValues?: ReadonlyArray<V>;
  readonly required?: boolean;
}

export interface Prompter {
  intro(title: string): void;
  outro(message: string): void;
  note(body: string, title?: string): void;
  text(options: TextOptions): Promise<string | null>;
  confirm(options: ConfirmOptions): Promise<boolean | null>;
  select<V extends string>(options: SelectOptions<V>): Promise<V | null>;
  multiselect<V extends string>(
    options: MultiselectOptions<V>,
  ): Promise<ReadonlyArray<V> | null>;
}
