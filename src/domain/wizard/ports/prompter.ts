/**
 * Prompter port — the abstract surface the wizard orchestrator drives.
 * Implementations live in `infrastructure/prompts/`.
 *
 * Methods return `null` to signal user cancellation (Ctrl+C). The orchestrator
 * translates `null` to `Result.err(WIZARD_CANCELLED)`.
 *
 * No method throws on cancellation. Implementations swallow errors and return
 * `null`; programmer errors (invalid option shape) may still throw.
 *
 * Accessibility note: `SelectChoice.hint` is preferred over inlining
 * "(recommended)" / detection rationale into the `label`. Clack renders the
 * hint dimmed beside the option so the primary label stays scannable, and
 * screen-reader / monochrome terminals still receive the same text content.
 */

interface SelectChoice<V extends string> {
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

export interface PathOptions {
  readonly message: string;
  readonly initialValue?: string;
  /** When true, only directory paths are accepted (clack hides files). */
  readonly directory?: boolean;
  readonly validate?: (value: string) => string | undefined;
}

export interface ConfirmOptions {
  readonly message: string;
  readonly initialValue?: boolean;
  /** Override the default "Yes" label rendered next to the active state. */
  readonly active?: string;
  /** Override the default "No" label rendered next to the inactive state. */
  readonly inactive?: string;
}

export interface SelectOptions<V extends string> {
  readonly message: string;
  readonly options: ReadonlyArray<SelectChoice<V>>;
  readonly initialValue?: V;
  /** Cap the visible list height so long option sets stay scannable. */
  readonly maxItems?: number;
}

/**
 * Single-keystroke select. The `value` field of each choice MUST be a single
 * lowercase letter — clack listens for that key and returns it without the
 * user pressing Enter. Massively faster for the convert/advanced gate.
 */
export interface SelectKeyOptions<V extends string> {
  readonly message: string;
  readonly options: ReadonlyArray<SelectChoice<V>>;
  readonly initialValue?: V;
}

export interface MultiselectOptions<V extends string> {
  readonly message: string;
  readonly options: ReadonlyArray<SelectChoice<V>>;
  readonly initialValues?: ReadonlyArray<V>;
  readonly required?: boolean;
  /** Position the cursor on a specific value when the prompt opens. */
  readonly cursorAt?: V;
  /** Cap the visible list height. */
  readonly maxItems?: number;
}

/**
 * Type-ahead multiselect — same as `multiselect` but with a search field.
 * Use when the option list might be long (locales for big i18n sites,
 * extra-assets for kitchen-sink projects).
 */
export interface AutocompleteMultiselectOptions<V extends string> {
  readonly message: string;
  readonly options: ReadonlyArray<SelectChoice<V>>;
  readonly initialValues?: ReadonlyArray<V>;
  readonly required?: boolean;
  readonly maxItems?: number;
  readonly placeholder?: string;
}

/**
 * Levelled, non-blocking status output. Adapters render each level with a
 * distinct symbol AND distinct color, so users with color-vision deficiency
 * can distinguish them by shape alone.
 */
export interface Logger {
  info(message: string): void;
  success(message: string): void;
  step(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * A controllable progress indicator. Started with a message, updated in place
 * via `message`, ended with `stop` (success), `error` (failure), or `cancel`.
 * Used to give the user feedback during operations that take >100ms.
 */
export interface SpinnerHandle {
  message(text: string): void;
  stop(text?: string): void;
  error(text?: string): void;
}

export interface SpinnerOptions {
  readonly initialMessage: string;
  /** "dots" (default) or "timer" (shows elapsed time alongside the spinner). */
  readonly indicator?: 'dots' | 'timer';
}

export interface Prompter {
  intro(title: string): void;
  outro(message: string): void;
  /** Display the cancellation goodbye banner and terminate the prompt session. */
  cancel(message: string): void;
  note(body: string, title?: string): void;
  /** Levelled status output that integrates with the prompt session. */
  readonly log: Logger;
  text(options: TextOptions): Promise<string | null>;
  /**
   * Filesystem path picker. Falls back to `text` semantics when the adapter
   * doesn't render path completion (e.g. piped-stdin smoke tests), but the
   * production adapter renders clack's interactive directory picker.
   */
  path(options: PathOptions): Promise<string | null>;
  confirm(options: ConfirmOptions): Promise<boolean | null>;
  select<V extends string>(options: SelectOptions<V>): Promise<V | null>;
  /** Single-keystroke select — the value is a one-character key the user presses. */
  selectKey<V extends string>(options: SelectKeyOptions<V>): Promise<V | null>;
  multiselect<V extends string>(
    options: MultiselectOptions<V>,
  ): Promise<ReadonlyArray<V> | null>;
  /** Type-ahead multiselect for long option lists. */
  autocompleteMultiselect<V extends string>(
    options: AutocompleteMultiselectOptions<V>,
  ): Promise<ReadonlyArray<V> | null>;
  /**
   * Start a controllable spinner. The handle is the only way to stop or
   * update it; callers MUST call `stop()` or `error()` before the next
   * blocking prompt or the next render will overlap.
   */
  spinner(options: SpinnerOptions): SpinnerHandle;
}
