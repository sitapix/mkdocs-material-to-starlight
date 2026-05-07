import { describe, expect, it } from 'vitest';
import { err, isErr, isOk, mapErr, mapResult, ok, type Result } from './result.js';

describe('Result constructors and predicates', () => {
  it('ok wraps a value', () => {
    const r: Result<number, string> = ok(42);
    expect(r).toEqual({ ok: true, value: 42 });
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
  });

  it('err wraps an error', () => {
    const r: Result<number, string> = err('nope');
    expect(r).toEqual({ ok: false, error: 'nope' });
    expect(isErr(r)).toBe(true);
    expect(isOk(r)).toBe(false);
  });
});

describe('mapResult', () => {
  it('transforms the value of an ok', () => {
    expect(mapResult(ok(2), (n) => n * 3)).toEqual(ok(6));
  });

  it('passes through an err untouched', () => {
    const e: Result<number, string> = err('bad');
    expect(mapResult(e, (n) => n * 3)).toBe(e);
  });
});

describe('mapErr', () => {
  it('transforms the error of an err', () => {
    expect(mapErr(err('bad'), (e) => `prefix: ${e}`)).toEqual(err('prefix: bad'));
  });

  it('passes through an ok untouched', () => {
    const v: Result<number, string> = ok(7);
    expect(mapErr(v, (e) => `prefix: ${e}`)).toBe(v);
  });
});
