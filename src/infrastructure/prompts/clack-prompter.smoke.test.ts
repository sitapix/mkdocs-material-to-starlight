import { beforeEach, describe, expect, it, vi } from 'vitest';

const clack = vi.hoisted(() => {
  const spinnerHandle = {
    start: vi.fn(),
    message: vi.fn(),
    stop: vi.fn(),
    error: vi.fn(),
    cancel: vi.fn(),
  };
  return {
    cancelValue: Symbol('cancel'),
    autocompleteMultiselect: vi.fn(),
    cancel: vi.fn(),
    confirm: vi.fn(),
    intro: vi.fn(),
    log: {
      info: vi.fn(),
      success: vi.fn(),
      step: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    multiselect: vi.fn(),
    note: vi.fn(),
    outro: vi.fn(),
    path: vi.fn(),
    select: vi.fn(),
    selectKey: vi.fn(),
    spinner: vi.fn(() => spinnerHandle),
    spinnerHandle,
    text: vi.fn(),
    updateSettings: vi.fn(),
  };
});

vi.mock('@clack/prompts', () => ({
  autocompleteMultiselect: clack.autocompleteMultiselect,
  cancel: clack.cancel,
  confirm: clack.confirm,
  intro: clack.intro,
  isCancel: (value: unknown) => value === clack.cancelValue,
  log: clack.log,
  multiselect: clack.multiselect,
  note: clack.note,
  outro: clack.outro,
  path: clack.path,
  select: clack.select,
  selectKey: clack.selectKey,
  spinner: clack.spinner,
  text: clack.text,
  updateSettings: clack.updateSettings,
}));

import { createClackPrompter } from './clack-prompter.js';

describe('createClackPrompter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards display, logging, highlighting, and spinner operations', () => {
    const p = createClackPrompter();

    p.intro('Setup');
    p.outro('Done');
    p.cancel('Stopped');
    p.note('hello world', 'A title');
    p.log.info('info');
    p.log.success('success');
    p.log.step('step');
    p.log.warn('warn');
    p.log.error('error');

    expect(clack.intro).toHaveBeenCalledWith(' Setup ');
    expect(clack.outro).toHaveBeenCalledWith('Done');
    expect(clack.cancel).toHaveBeenCalledWith('Stopped');
    expect(clack.note).toHaveBeenCalledWith('hello world', 'A title', {
      format: expect.any(Function),
    });
    const formatter = clack.note.mock.calls[0]?.[2]?.format as
      | ((line: string) => string)
      | undefined;
    expect(formatter?.('plain text')).toBe('plain text');
    expect(clack.log.info).toHaveBeenCalledWith('info');
    expect(clack.log.success).toHaveBeenCalledWith('success');
    expect(clack.log.step).toHaveBeenCalledWith('step');
    expect(clack.log.warn).toHaveBeenCalledWith('warn');
    expect(clack.log.error).toHaveBeenCalledWith('error');

    expect(p.highlight.name('name')).toBe('name');
    expect(p.highlight.url('url')).toBe('url');
    expect(p.highlight.value('value')).toBe('value');
    expect(p.highlight.count('count')).toBe('count');
    expect(p.highlight.dim('dim')).toBe('dim');

    const spinner = p.spinner({ initialMessage: 'Starting', indicator: 'timer' });
    spinner.message('Working');
    spinner.stop('Stopped');
    spinner.error('Failed');
    spinner.cancel('Cancelled');
    expect(clack.spinner).toHaveBeenCalledWith({ indicator: 'timer' });
    expect(clack.spinnerHandle.start).toHaveBeenCalledWith('Starting');
    expect(clack.spinnerHandle.message).toHaveBeenCalledWith('Working');
    expect(clack.spinnerHandle.stop).toHaveBeenCalledWith('Stopped');
    expect(clack.spinnerHandle.error).toHaveBeenCalledWith('Failed');
    expect(clack.spinnerHandle.cancel).toHaveBeenCalledWith('Cancelled');

    p.spinner({ initialMessage: 'Default indicator' });
    expect(clack.spinner).toHaveBeenLastCalledWith({ indicator: 'dots' });
  });

  it('maps every prompt option and returns submitted values', async () => {
    const p = createClackPrompter();
    const validate = vi.fn((value: string) => (value ? undefined : 'required'));
    clack.text.mockResolvedValueOnce('typed');
    clack.path.mockResolvedValueOnce('/tmp/site');
    clack.confirm.mockResolvedValueOnce(false);
    clack.select.mockResolvedValueOnce('b');
    clack.selectKey.mockResolvedValueOnce('a');
    clack.multiselect.mockResolvedValueOnce(['a']);
    clack.autocompleteMultiselect.mockResolvedValueOnce(['b']);

    await expect(
      p.text({
        message: 'Text',
        initialValue: 'initial',
        placeholder: 'placeholder',
        defaultValue: 'default',
        validate,
      }),
    ).resolves.toBe('typed');
    const textOptions = clack.text.mock.calls[0]?.[0];
    expect(textOptions).toMatchObject({
      message: 'Text',
      initialValue: 'initial',
      placeholder: 'placeholder',
      defaultValue: 'default',
      validate: expect.any(Function),
    });
    expect(textOptions?.validate?.(undefined)).toBe('required');
    expect(validate).toHaveBeenCalledWith('');

    await expect(
      p.path({ message: 'Path', initialValue: '/tmp', directory: true, validate }),
    ).resolves.toBe('/tmp/site');
    const pathOptions = clack.path.mock.calls[0]?.[0];
    expect(pathOptions).toMatchObject({
      message: 'Path',
      initialValue: '/tmp',
      directory: true,
      validate: expect.any(Function),
    });
    expect(pathOptions?.validate?.(undefined)).toBe('required');

    await expect(
      p.confirm({ message: 'Confirm', initialValue: false, active: 'Yes', inactive: 'No' }),
    ).resolves.toBe(false);
    expect(clack.confirm).toHaveBeenCalledWith({
      message: 'Confirm',
      initialValue: false,
      active: 'Yes',
      inactive: 'No',
    });

    const options = [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B', hint: 'hint' },
    ] as const;
    await expect(
      p.select({ message: 'Select', options, initialValue: 'a', maxItems: 2 }),
    ).resolves.toBe('b');
    expect(clack.select).toHaveBeenCalledWith({
      message: 'Select',
      options: Array.from(options),
      initialValue: 'a',
      maxItems: 2,
    });

    await expect(p.selectKey({ message: 'Select key', options, initialValue: 'b' })).resolves.toBe(
      'a',
    );
    expect(clack.selectKey).toHaveBeenCalledWith({
      message: 'Select key',
      options: Array.from(options),
      initialValue: 'b',
    });

    await expect(
      p.multiselect({
        message: 'Many',
        options,
        initialValues: ['b'],
        required: true,
        cursorAt: 'b',
        maxItems: 2,
      }),
    ).resolves.toEqual(['a']);
    expect(clack.multiselect).toHaveBeenCalledWith({
      message: 'Many',
      options: Array.from(options),
      initialValues: ['b'],
      required: true,
      cursorAt: 'b',
      maxItems: 2,
    });

    await expect(
      p.autocompleteMultiselect({
        message: 'Search many',
        options,
        initialValues: ['a'],
        required: false,
        maxItems: 1,
        placeholder: 'Search',
      }),
    ).resolves.toEqual(['b']);
    expect(clack.autocompleteMultiselect).toHaveBeenCalledWith({
      message: 'Search many',
      options: Array.from(options),
      initialValues: ['a'],
      required: false,
      maxItems: 1,
      placeholder: 'Search',
    });
  });

  it('omits absent prompt options and maps cancellation to null', async () => {
    const p = createClackPrompter();
    const options = [{ value: 'a', label: 'A' }] as const;
    clack.text.mockResolvedValueOnce(clack.cancelValue);
    clack.path.mockResolvedValueOnce(clack.cancelValue);
    clack.confirm.mockResolvedValueOnce(clack.cancelValue);
    clack.select.mockResolvedValueOnce(clack.cancelValue);
    clack.selectKey.mockResolvedValueOnce(clack.cancelValue);
    clack.multiselect.mockResolvedValueOnce(clack.cancelValue);
    clack.autocompleteMultiselect.mockResolvedValueOnce(clack.cancelValue);

    await expect(p.text({ message: 'Text' })).resolves.toBeNull();
    await expect(p.path({ message: 'Path' })).resolves.toBeNull();
    await expect(p.confirm({ message: 'Confirm' })).resolves.toBeNull();
    await expect(p.select({ message: 'Select', options })).resolves.toBeNull();
    await expect(p.selectKey({ message: 'Select key', options })).resolves.toBeNull();
    await expect(p.multiselect({ message: 'Many', options })).resolves.toBeNull();
    await expect(
      p.autocompleteMultiselect({ message: 'Search many', options }),
    ).resolves.toBeNull();

    expect(clack.text).toHaveBeenCalledWith({ message: 'Text' });
    expect(clack.path).toHaveBeenCalledWith({ message: 'Path' });
    expect(clack.confirm).toHaveBeenCalledWith({ message: 'Confirm' });
    expect(clack.select).toHaveBeenCalledWith({ message: 'Select', options: Array.from(options) });
    expect(clack.selectKey).toHaveBeenCalledWith({
      message: 'Select key',
      options: Array.from(options),
    });
    expect(clack.multiselect).toHaveBeenCalledWith({
      message: 'Many',
      options: Array.from(options),
    });
    expect(clack.autocompleteMultiselect).toHaveBeenCalledWith({
      message: 'Search many',
      options: Array.from(options),
    });
  });
});
