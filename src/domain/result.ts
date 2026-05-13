/**
 * Typed Result — replaces ad-hoc `{ ok: true } | { ok: false }` shapes.
 *
 * Errors are values, not exceptions. Use `Result<T, E>` for any function whose
 * failure mode is part of its API contract (validation, parsing, resolution).
 * Reserve `throw` for unrecoverable conditions that originate at infrastructure
 * boundaries (corrupt file, OOM, programmer error).
 */

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isOk<T, E>(r: Result<T, E>): r is Extract<Result<T, E>, { ok: true }> {
  return r.ok;
}

export function isErr<T, E>(r: Result<T, E>): r is Extract<Result<T, E>, { ok: false }> {
  return !r.ok;
}

export function mapResult<T, U, E>(r: Result<T, E>, f: (value: T) => U): Result<U, E> {
  return r.ok ? ok(f(r.value)) : r;
}

export function mapErr<T, E, F>(r: Result<T, E>, f: (error: E) => F): Result<T, F> {
  return r.ok ? r : err(f(r.error));
}
