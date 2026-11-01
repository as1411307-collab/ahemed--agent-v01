/**
 * Restricted RFC8785 JSON canonicalization for signed, validated I-JSON envelopes.
 * IMPORTANT: reject duplicate JSON keys BEFORE JSON.parse; no parser can recover
 * that information after parsing. Validate service-specific numbers and URLs.
 */
export type JsonValue = null | boolean | number | string | JsonValue[] | {[key: string]: JsonValue};

export function canonicalize(value: unknown): string {
  const ancestors = new Set<object>();
  function unicode(s: string): void {
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF) {
        const next = s.charCodeAt(++i);
        if (i >= s.length || next < 0xDC00 || next > 0xDFFF) throw new Error('INVALID_JCS_UNICODE');
      } else if (c >= 0xDC00 && c <= 0xDFFF) {
        throw new Error('INVALID_JCS_UNICODE');
      }
    }
  }
  function walk(v: unknown): string {
    if (v === null) return 'null';
    if (typeof v === 'string') { unicode(v); return JSON.stringify(v); }
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) throw new Error('INVALID_JCS_NUMBER');
      return JSON.stringify(v);
    }
    if (typeof v !== 'object') throw new Error('INVALID_JCS_TYPE');
    if (ancestors.has(v)) throw new Error('INVALID_JCS_CYCLE');
    if (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) {
      throw new Error('INVALID_JCS_OBJECT');
    }
    ancestors.add(v);
    try {
      const desc = Object.getOwnPropertyDescriptors(v);
      if (Array.isArray(v)) {
        for (let i = 0; i < v.length; i++) {
          if (!Object.hasOwn(desc, String(i)) || !('value' in desc[String(i)])) throw new Error('INVALID_JCS_ARRAY');
        }
        return '[' + v.map(walk).join(',') + ']';
      }
      const keys = Object.keys(desc).sort(); // JS UTF-16 lexical order per RFC8785
      for (const key of keys) {
        unicode(key);
        if (!desc[key].enumerable || !('value' in desc[key])) throw new Error('INVALID_JCS_PROPERTY');
      }
      return '{' + keys.map(key => JSON.stringify(key) + ':' + walk(desc[key].value)).join(',') + '}';
    } finally {
      ancestors.delete(v);
    }
  }
  return walk(value);
}