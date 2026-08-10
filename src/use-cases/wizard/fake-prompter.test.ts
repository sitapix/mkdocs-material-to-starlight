import { describe, expect, it } from 'vitest';
import { createFakePrompter } from './fake-prompter.js';

const options = [{ value: 'first', label: 'First' }] as const;

describe('createFakePrompter', () => {
  it('uses every prompt fallback and records optional text fields', async () => {
    const p = createFakePrompter();

    await expect(
      p.text({
        message: 'Text',
        initialValue: 'initial',
        placeholder: 'hint',
        defaultValue: 'default',
      }),
    ).resolves.toBe('initial');
    await expect(p.text({ message: 'Default', defaultValue: 'default' })).resolves.toBe('default');
    await expect(p.text({ message: 'Empty' })).resolves.toBe('');
    await expect(p.path({ message: 'Path' })).resolves.toBe('');
    await expect(p.confirm({ message: 'Confirm' })).resolves.toBe(true);
    await expect(p.select({ message: 'Select', options: [] })).resolves.toBeNull();
    await expect(p.selectKey({ message: 'Select key', options: [] })).resolves.toBeNull();
    await expect(p.multiselect({ message: 'Many', options })).resolves.toEqual([]);
    await expect(p.autocompleteMultiselect({ message: 'Search', options })).resolves.toEqual([]);

    expect(p.calls[0]).toEqual({
      kind: 'text',
      message: 'Text',
      initialValue: 'initial',
      placeholder: 'hint',
      defaultValue: 'default',
    });
  });

  it('falls back after a scripted answer list is exhausted', async () => {
    const p = createFakePrompter({
      text: ['scripted'],
      path: ['/scripted'],
      confirm: [false],
      select: ['first'],
      selectKey: ['first'],
      multiselect: [['first']],
      autocompleteMultiselect: [['first']],
    });

    await expect(p.text({ message: 'Text' })).resolves.toBe('scripted');
    await expect(p.text({ message: 'Text again', initialValue: 'fallback' })).resolves.toBe(
      'fallback',
    );
    await expect(p.path({ message: 'Path' })).resolves.toBe('/scripted');
    await expect(p.path({ message: 'Path again', initialValue: '/fallback' })).resolves.toBe(
      '/fallback',
    );
    await expect(p.confirm({ message: 'Confirm' })).resolves.toBe(false);
    await expect(p.confirm({ message: 'Confirm again', initialValue: false })).resolves.toBe(false);
    await expect(p.select({ message: 'Select', options })).resolves.toBe('first');
    await expect(p.select({ message: 'Select again', options })).resolves.toBe('first');
    await expect(p.selectKey({ message: 'Select key', options })).resolves.toBe('first');
    await expect(p.selectKey({ message: 'Select key again', options })).resolves.toBe('first');
    await expect(p.multiselect({ message: 'Many', options })).resolves.toEqual(['first']);
    await expect(
      p.multiselect({ message: 'Many again', options, initialValues: ['first'] }),
    ).resolves.toEqual(['first']);
    await expect(p.autocompleteMultiselect({ message: 'Search', options })).resolves.toEqual([
      'first',
    ]);
    await expect(
      p.autocompleteMultiselect({ message: 'Search again', options, initialValues: ['first'] }),
    ).resolves.toEqual(['first']);
  });

  it('records logs, notes, highlights, and spinner endings with and without messages', () => {
    const p = createFakePrompter();
    p.intro('Intro');
    p.outro('Outro');
    p.cancel('Cancel');
    p.note('Body');
    p.log.info('info');
    p.log.success('success');
    p.log.step('step');
    p.log.warn('warn');
    p.log.error('error');
    expect(p.highlight.name('name')).toBe('name');
    expect(p.highlight.url('url')).toBe('url');
    expect(p.highlight.value('value')).toBe('value');
    expect(p.highlight.count('count')).toBe('count');
    expect(p.highlight.dim('dim')).toBe('dim');

    const first = p.spinner({ initialMessage: 'First' });
    first.message('working');
    first.stop();
    first.error();
    first.cancel();
    const second = p.spinner({ initialMessage: 'Second' });
    second.stop('done');
    second.error('failed');
    second.cancel('cancelled');

    expect(p.notes).toEqual([{ title: undefined, body: 'Body' }]);
    expect(p.logs.map((entry) => entry.level)).toEqual([
      'info',
      'success',
      'step',
      'warn',
      'error',
    ]);
    expect(p.spinners).toMatchObject([
      { initialMessage: 'First', messages: ['working'], stoppedWith: '', erroredWith: '' },
      { initialMessage: 'Second', stoppedWith: 'done', erroredWith: 'failed' },
    ]);
  });
});
