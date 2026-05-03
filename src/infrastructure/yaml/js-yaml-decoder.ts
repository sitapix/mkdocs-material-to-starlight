/**
 * Production adapter for the `YamlDecoder` port using `js-yaml`.
 *
 * Uses the default js-yaml schema extended with tolerant types for the
 * `!!python/name:...` and `!!python/object*` families that mkdocs configs
 * commonly use to reference Python callables (pymdownx.superfences custom
 * fences, mermaid integration, etc.). These tags are decoded as opaque
 * string markers — the converter never invokes the underlying Python, it
 * only needs the YAML to parse so the rest of the config can be processed.
 *
 * The dangerous `!!js/function` tag is NOT added; js-yaml's default schema
 * still rejects it.
 *
 * Imperative shell — js-yaml is the only direct dependency for this port.
 */

import { load, DEFAULT_SCHEMA, Type, YAMLException } from 'js-yaml';
import { ok, err, type Result } from '../../domain/result.js';
import type {
  YamlDecodeError,
  YamlDecoder,
} from '../../domain/ports/yaml-decoder.js';

const PYTHON_NAME_PREFIX = 'tag:yaml.org,2002:python/name:';
const PYTHON_OBJECT_PREFIX = 'tag:yaml.org,2002:python/object';
const ENV_TAG = '!ENV';

const envScalarType = new Type(ENV_TAG, {
  kind: 'scalar',
  resolve: () => true,
  // `!ENV VAR_NAME` — preserve the var name as an opaque string. Conversion
  // never reads the runtime env, so a static placeholder is the safest
  // approximation.
  construct: (data) => (typeof data === 'string' ? data : ''),
});

const envSequenceType = new Type(ENV_TAG, {
  kind: 'sequence',
  resolve: () => true,
  // `!ENV [VAR1, ..., default]` — mkdocs's env-var plugin returns `default`
  // when none of the vars are set. At conversion time we always pick the
  // default (last element); it is the right static value to reason about.
  construct: (data) => {
    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }
    return data[data.length - 1];
  },
});

const pythonNameType = new Type(PYTHON_NAME_PREFIX, {
  kind: 'scalar',
  multi: true,
  resolve: () => true,
  construct: (_data, type) =>
    typeof type === 'string' ? type.slice(PYTHON_NAME_PREFIX.length) : '',
});

const pythonObjectType = new Type(PYTHON_OBJECT_PREFIX, {
  kind: 'scalar',
  multi: true,
  resolve: () => true,
  construct: (_data, type) =>
    typeof type === 'string' ? type.slice(PYTHON_OBJECT_PREFIX.length) : '',
});

const pythonObjectSequenceType = new Type(PYTHON_OBJECT_PREFIX, {
  kind: 'sequence',
  multi: true,
  resolve: () => true,
  construct: (_data, type) =>
    typeof type === 'string' ? type.slice(PYTHON_OBJECT_PREFIX.length) : '',
});

const PYTHON_TOLERANT_SCHEMA = DEFAULT_SCHEMA.extend([
  pythonNameType,
  pythonObjectType,
  pythonObjectSequenceType,
  envScalarType,
  envSequenceType,
]);

export function createJsYamlDecoder(): YamlDecoder {
  return {
    decode(source: string): Result<unknown, YamlDecodeError> {
      try {
        const value = load(source, { schema: PYTHON_TOLERANT_SCHEMA });
        return ok(value === undefined ? null : value);
      } catch (cause) {
        return err(translateError(cause));
      }
    },
  };
}

function translateError(cause: unknown): YamlDecodeError {
  if (cause instanceof YAMLException) {
    const mark = cause.mark;
    return mark === undefined
      ? { message: cause.reason }
      : { message: cause.reason, line: mark.line + 1, column: mark.column + 1 };
  }
  if (cause instanceof Error) {
    return { message: cause.message };
  }
  return { message: 'unknown YAML decode error' };
}
