import { describe, expect, it } from 'vitest';
import { validateOutput } from './validate.js';
import type {
  OutputValidator,
  OutputValidationResult,
} from '../../domain/ports/output-validator.js';

function fakeValidator(result: OutputValidationResult): OutputValidator {
  return {
    async validate() {
      return result;
    },
  };
}

describe('validateOutput', () => {
  it('returns no diagnostics when the validator reports ok', async () => {
    const diags = await validateOutput('text', 'mdx', fakeValidator({ kind: 'ok' }));
    expect(diags).toEqual([]);
  });

  it('emits one error diagnostic per validation failure with line/column', async () => {
    const diags = await validateOutput(
      'text',
      'mdx',
      fakeValidator({
        kind: 'failure',
        errors: [
          { line: 12, column: 5, message: 'Unexpected character' },
          { line: 18, column: 1, message: 'Unclosed expression' },
        ],
      }),
    );
    expect(diags).toHaveLength(2);
    expect(diags[0]?.severity).toBe('error');
    expect(diags[0]?.ruleId).toBe('output-syntax-error');
    expect(diags[0]?.place).toEqual({ line: 12, column: 5 });
    expect(diags[0]?.message).toContain('MDX');
    expect(diags[0]?.message).toContain('Unexpected character');
    expect(diags[1]?.place).toEqual({ line: 18, column: 1 });
  });

  it('passes through failures without line/column metadata', async () => {
    const diags = await validateOutput(
      'text',
      'md',
      fakeValidator({
        kind: 'failure',
        errors: [{ line: null, column: null, message: 'Generic failure' }],
      }),
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]?.place).toBeUndefined();
    expect(diags[0]?.message).toContain('MD');
  });

  it('emits a single info diagnostic when the validator driver is missing', async () => {
    const diags = await validateOutput(
      'text',
      'mdx',
      fakeValidator({
        kind: 'driver-missing',
        hint: 'install @mdx-js/mdx for output validation',
      }),
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]?.severity).toBe('info');
    expect(diags[0]?.ruleId).toBe('output-validator-unavailable');
    expect(diags[0]?.message).toContain('@mdx-js/mdx');
  });
});
