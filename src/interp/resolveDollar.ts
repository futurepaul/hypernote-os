// TODO DEPRECATED: retained only for downstream packages that still import
// the legacy `$`-prefixed query helpers. Hypernote OS no longer references
// these utilities directly; prefer `interp/reference` instead.

export type ResolvedDollar = { value: string; suffix: string } | null;

export function resolveDollar(raw: string, queries: Record<string, any>): ResolvedDollar {
  const trimmed = (raw || '').trim();
  const inner = unwrapMustache(trimmed);
  const target = inner ?? trimmed;
  if (!target.startsWith('$')) return undefined;
  const match = target.match(/^(\$[A-Za-z0-9_.-]+)(.*)$/);
  if (!match) return undefined;
  const pathToken = match[1];
  const suffix = match[2] || '';
  const [qid, ...rest] = pathToken.split('.');
  if (!qid) return undefined;
  let current: any = queries[qid];
  for (const key of rest) {
    if (current == null) return undefined;
    current = current[key];
  }
  if (current == null) return undefined;
  const base = String(current);
  return { value: base, suffix };
}

export function resolveDollarPath(raw: string, queries: Record<string, any>): unknown {
  const resolved = resolveDollar(raw, queries);
  if (!resolved) return undefined;
  return resolved.suffix ? `${resolved.value}${resolved.suffix}` : resolved.value;
}

function unwrapMustache(text: string): string | null {
  if (text.startsWith('{{') && text.endsWith('}}')) {
    return text.slice(2, -2).trim();
  }
  return null;
}
