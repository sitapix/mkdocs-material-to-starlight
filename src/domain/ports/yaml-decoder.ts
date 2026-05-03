/**
 * YamlDecoder port — converts YAML source text into a plain JS value.
 *
 * Pure declaration. Use-cases that need to parse `mkdocs.yml`, `.pages`, or
 * any other YAML take this port as a parameter and remain testable without
 * pulling in a YAML library. Tests can pass a stub that returns a fixed
 * value; production wires `js-yaml` via the adapter in `infrastructure/yaml/`.
 */

import type { Result } from '../result.js';

export interface YamlDecodeError {
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
}

export interface YamlDecoder {
  decode(source: string): Result<unknown, YamlDecodeError>;
}
