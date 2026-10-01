/**
 * A very small schema DSL.
 *
 * It exists so the validator and the published JSON Schema files have one
 * source of truth, and so an error can say "nodes[3].sublabel is 94 characters,
 * the limit is 72" instead of pointing at a path and leaving the author to
 * guess. Only the subset these diagrams actually need is implemented.
 */

export const str = (o = {}) => ({ kind: 'str', ...o });
export const int = (o = {}) => ({ kind: 'int', ...o });
export const num = (o = {}) => ({ kind: 'num', ...o });
export const bool = (o = {}) => ({ kind: 'bool', ...o });
export const lit = (value) => ({ kind: 'lit', value });
export const enumOf = (values, o = {}) => ({ kind: 'enum', values, ...o });
export const arr = (items, o = {}) => ({ kind: 'arr', items, ...o });
export const obj = (props, o = {}) => ({ kind: 'obj', props, required: o.required || [], ...o });
export const tuple = (items, o = {}) => ({ kind: 'tuple', items, ...o });
export const anyOf = (options, o = {}) => ({ kind: 'anyOf', options, ...o });

/** A reference to an id declared elsewhere in the document. Checked after shape. */
export const ref = (collection, o = {}) => ({ kind: 'str', refOf: collection, pattern: ID_PATTERN, ...o });

export const ID_PATTERN = '^[a-z0-9][a-z0-9_-]{0,47}$';

export class Issue {
  constructor(path, message, hint) {
    this.path = path;
    this.message = message;
    if (hint) this.hint = hint;
  }
  toString() {
    return `${this.path || '<root>'}: ${this.message}${this.hint ? ` — ${this.hint}` : ''}`;
  }
}

const join = (path, key) =>
  (typeof key === 'number' ? `${path}[${key}]` : path ? `${path}.${key}` : String(key));

/**
 * @returns {Issue[]} empty when the value matches the spec
 */
export function validate(value, spec, path = '') {
  if (value === undefined || value === null) {
    return [new Issue(path, 'is required but missing')];
  }
  switch (spec.kind) {
    case 'lit': return value === spec.value ? [] : [new Issue(path, `must be ${JSON.stringify(spec.value)}`)];
    case 'str': return validateStr(value, spec, path);
    case 'int': return validateNumber(value, spec, path, true);
    case 'num': return validateNumber(value, spec, path, false);
    case 'bool': return typeof value === 'boolean' ? [] : [new Issue(path, 'must be true or false')];
    case 'enum': return spec.values.includes(value)
      ? []
      : [new Issue(path, `must be one of ${spec.values.map((v) => `"${v}"`).join(', ')}`, `got ${JSON.stringify(value)}`)];
    case 'arr': return validateArr(value, spec, path);
    case 'tuple': return validateTuple(value, spec, path);
    case 'obj': return validateObj(value, spec, path);
    case 'anyOf': return validateAnyOf(value, spec, path);
    default: return [new Issue(path, `unknown spec kind "${spec.kind}"`)];
  }
}

function validateStr(value, spec, path) {
  if (typeof value !== 'string') return [new Issue(path, 'must be a string')];
  const issues = [];
  const len = Array.from(value).length;
  if (spec.min !== undefined && len < spec.min) {
    issues.push(new Issue(path, `must be at least ${spec.min} character${spec.min === 1 ? '' : 's'}`));
  }
  if (spec.max !== undefined && len > spec.max) {
    issues.push(new Issue(path, `is ${len} characters, the limit is ${spec.max}`, spec.why || 'longer text does not fit its box'));
  }
  if (spec.pattern && !new RegExp(spec.pattern).test(value)) {
    issues.push(new Issue(path, `does not match ${spec.pattern}`, spec.refOf ? 'ids are lowercase letters, digits, hyphen and underscore' : undefined));
  }
  return issues;
}

function validateNumber(value, spec, path, integer) {
  if (typeof value !== 'number' || Number.isNaN(value)) return [new Issue(path, 'must be a number')];
  if (integer && !Number.isInteger(value)) return [new Issue(path, 'must be a whole number')];
  const issues = [];
  if (spec.min !== undefined && value < spec.min) issues.push(new Issue(path, `must be at least ${spec.min}`));
  if (spec.max !== undefined && value > spec.max) issues.push(new Issue(path, `must be at most ${spec.max}`));
  return issues;
}

function validateArr(value, spec, path) {
  if (!Array.isArray(value)) return [new Issue(path, 'must be an array')];
  const issues = [];
  if (spec.min !== undefined && value.length < spec.min) {
    issues.push(new Issue(path, `needs at least ${spec.min} item${spec.min === 1 ? '' : 's'}`));
  }
  if (spec.max !== undefined && value.length > spec.max) {
    issues.push(new Issue(path, `has ${value.length} items, the limit is ${spec.max}`, spec.why));
  }
  value.forEach((item, i) => issues.push(...validate(item, spec.items, join(path, i))));
  return issues;
}

function validateTuple(value, spec, path) {
  if (!Array.isArray(value)) return [new Issue(path, 'must be an array')];
  if (value.length !== spec.items.length) {
    return [new Issue(path, `must have exactly ${spec.items.length} items`)];
  }
  const issues = [];
  value.forEach((item, i) => issues.push(...validate(item, spec.items[i], join(path, i))));
  return issues;
}

function validateObj(value, spec, path) {
  if (typeof value !== 'object' || Array.isArray(value)) return [new Issue(path, 'must be an object')];
  const issues = [];
  for (const key of spec.required) {
    if (value[key] === undefined) issues.push(new Issue(join(path, key), 'is required but missing'));
  }
  for (const [key, child] of Object.entries(spec.props)) {
    if (value[key] === undefined) continue;
    issues.push(...validate(value[key], child, join(path, key)));
  }
  if (!spec.open) {
    for (const key of Object.keys(value)) {
      if (!spec.props[key]) {
        issues.push(new Issue(join(path, key), 'is not a field this schema defines', nearest(key, Object.keys(spec.props))));
      }
    }
  }
  return issues;
}

function validateAnyOf(value, spec, path) {
  for (const option of spec.options) {
    if (validate(value, option, path).length === 0) return [];
  }
  return [new Issue(path, spec.message || 'does not match any accepted shape')];
}

/** Cheap "did you mean" for an unknown key. */
function nearest(key, candidates) {
  let best = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    const score = levenshtein(key.toLowerCase(), c.toLowerCase());
    if (score < bestScore) { bestScore = score; best = c; }
  }
  return best && bestScore <= Math.max(2, Math.floor(key.length / 3)) ? `did you mean "${best}"?` : undefined;
}

function levenshtein(a, b) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return rows[a.length][b.length];
}

/** Emit a draft 2020-12 JSON Schema so editors can autocomplete the same shape. */
export function toJsonSchema(spec) {
  switch (spec.kind) {
    case 'lit': return { const: spec.value };
    case 'str': {
      const out = { type: 'string' };
      if (spec.min !== undefined) out.minLength = spec.min;
      if (spec.max !== undefined) out.maxLength = spec.max;
      if (spec.pattern) out.pattern = spec.pattern;
      if (spec.describe) out.description = spec.describe;
      return out;
    }
    case 'int': case 'num': {
      const out = { type: spec.kind === 'int' ? 'integer' : 'number' };
      if (spec.min !== undefined) out.minimum = spec.min;
      if (spec.max !== undefined) out.maximum = spec.max;
      if (spec.describe) out.description = spec.describe;
      return out;
    }
    case 'bool': return { type: 'boolean' };
    case 'enum': return { enum: spec.values, ...(spec.describe ? { description: spec.describe } : {}) };
    case 'arr': {
      const out = { type: 'array', items: toJsonSchema(spec.items) };
      if (spec.min !== undefined) out.minItems = spec.min;
      if (spec.max !== undefined) out.maxItems = spec.max;
      if (spec.describe) out.description = spec.describe;
      return out;
    }
    case 'tuple': return {
      type: 'array', prefixItems: spec.items.map(toJsonSchema), items: false,
      minItems: spec.items.length, maxItems: spec.items.length,
    };
    case 'obj': {
      const properties = {};
      for (const [key, child] of Object.entries(spec.props)) properties[key] = toJsonSchema(child);
      const out = { type: 'object', additionalProperties: Boolean(spec.open), properties };
      if (spec.required.length) out.required = [...spec.required];
      if (spec.describe) out.description = spec.describe;
      return out;
    }
    case 'anyOf': return { anyOf: spec.options.map(toJsonSchema) };
    default: return {};
  }
}

/** Walk a spec tree, calling `visit(spec, path)` for every node. */
export function walk(spec, visit, path = '') {
  visit(spec, path);
  if (spec.kind === 'obj') {
    for (const [key, child] of Object.entries(spec.props)) walk(child, visit, join(path, key));
  } else if (spec.kind === 'arr') {
    walk(spec.items, visit, `${path}[]`);
  } else if (spec.kind === 'tuple') {
    spec.items.forEach((child, i) => walk(child, visit, join(path, i)));
  } else if (spec.kind === 'anyOf') {
    spec.options.forEach((child) => walk(child, visit, path));
  }
}
