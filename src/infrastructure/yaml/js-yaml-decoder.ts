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

import { defineScalarTag, defineSequenceTag, load, YAML11_SCHEMA, YAMLException } from 'js-yaml';
import type { YamlDecodeError, YamlDecoder } from '../../domain/ports/yaml-decoder.js';
import { err, ok, type Result } from '../../domain/result.js';

const PYTHON_NAME_PREFIX = 'tag:yaml.org,2002:python/name:';
const PYTHON_OBJECT_PREFIX = 'tag:yaml.org,2002:python/object';
const ENV_TAG = '!ENV';

const envScalarTag = defineScalarTag(ENV_TAG, {
  // `!ENV VAR_NAME` — preserve the var name as an opaque string. Conversion
  // never reads the runtime env, so a static placeholder is the safest
  // approximation.
  resolve: (source) => source,
});

const envSequenceTag = defineSequenceTag<unknown[], unknown>(ENV_TAG, {
  // `!ENV [VAR1, ..., default]` — mkdocs's env-var plugin returns `default`
  // when none of the vars are set. At conversion time we always pick the
  // default (last element); it is the right static value to reason about.
  create: () => [],
  addItem: (items, item) => {
    items.push(item);
  },
  finalize: (items) => {
    if (items.length === 0) {
      return null;
    }
    return items[items.length - 1];
  },
  identify: () => false,
  represent: () => [],
});

const pythonNameTag = defineScalarTag(PYTHON_NAME_PREFIX, {
  matchByTagPrefix: true,
  resolve: (_source, _isExplicit, tagName) => tagName.slice(PYTHON_NAME_PREFIX.length),
});

const pythonObjectTag = defineScalarTag(PYTHON_OBJECT_PREFIX, {
  matchByTagPrefix: true,
  resolve: (_source, _isExplicit, tagName) => tagName.slice(PYTHON_OBJECT_PREFIX.length),
});

const pythonObjectSequenceTag = defineSequenceTag<string, string>(PYTHON_OBJECT_PREFIX, {
  matchByTagPrefix: true,
  create: (tagName) => tagName.slice(PYTHON_OBJECT_PREFIX.length),
  addItem: () => {},
  identify: () => false,
});

const PYTHON_TOLERANT_SCHEMA = YAML11_SCHEMA.withTags([
  pythonNameTag,
  pythonObjectTag,
  pythonObjectSequenceTag,
  envScalarTag,
  envSequenceTag,
]);

export function createJsYamlDecoder(): YamlDecoder {
  return {
    decode(source: string): Result<unknown, YamlDecodeError> {
      // js-yaml 5 rejects an empty stream instead of returning undefined.
      // Preserve the port's established empty-document contract.
      if (source.trim().length === 0) {
        return ok(null);
      }
      try {
        const value = load(source, { schema: PYTHON_TOLERANT_SCHEMA });
        return ok(value === undefined ? null : value);
      } catch (cause) {
        // PyYAML (and therefore MkDocs) silently accepts duplicate mapping
        // keys with last-key-wins semantics. js-yaml is strict by default.
        // On *only* the duplicate-key error, retry in JSON-compatible mode
        // so the converter can run on any config MkDocs would build.
        if (isDuplicateKeyError(cause)) {
          try {
            const value = load(source, {
              schema: PYTHON_TOLERANT_SCHEMA,
              json: true,
            });
            return ok(value === undefined ? null : value);
          } catch (retryCause) {
            return err(translateError(retryCause));
          }
        }
        return err(translateError(cause));
      }
    },
  };
}

function isDuplicateKeyError(cause: unknown): boolean {
  return cause instanceof YAMLException && cause.reason.includes('duplicated mapping key');
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
