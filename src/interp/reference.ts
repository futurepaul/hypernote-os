export type ReferenceSegment = string | number;

export type Reference = {
  root: string;
  segments: ReferenceSegment[];
};

export type ReferenceScope = {
  queries?: Record<string, any>;
  globals?: any;
};

export function parseReference(raw: string): Reference | null {
  const text = (raw || '').trim();
  if (!text) return null;
  let index = 0;

  const skipDot = () => {
    if (text[index] === '.') index += 1;
  };

  const readIdentifier = (): string | null => {
    let start = index;
    while (index < text.length) {
      const ch = text[index];
      if (ch === '.' || ch === '[') break;
      if (!isIdentifierChar(ch, index === start)) return null;
      index += 1;
    }
    if (start === index) return null;
    return text.slice(start, index);
  };

  const readBracket = (): ReferenceSegment | null => {
    if (text[index] !== '[') return null;
    index += 1;
    let depth = 1;
    let start = index;
    while (index < text.length && depth > 0) {
      const ch = text[index];
      if (ch === '[') depth += 1;
      else if (ch === ']') depth -= 1;
      if (depth === 0) break;
      index += 1;
    }
    if (depth !== 0) return null;
    const inner = text.slice(start, index).trim();
    index += 1; // skip closing bracket
    if (!inner.length) return null;
    if (/^-?\d+$/.test(inner)) return Number(inner);
    if ((inner.startsWith('"') && inner.endsWith('"')) || (inner.startsWith("'") && inner.endsWith("'"))) {
      return inner.slice(1, -1);
    }
    return inner;
  };

  const root = readIdentifier();
  if (!root) return null;
  const segments: ReferenceSegment[] = [];

  while (index < text.length) {
    if (text[index] === '.') {
      index += 1;
      const ident = readIdentifier();
      if (!ident) return null;
      segments.push(ident);
      continue;
    }
    if (text[index] === '[') {
      const seg = readBracket();
      if (seg === null) return null;
      segments.push(seg);
      continue;
    }
    // Unexpected character (e.g., space, operator)
    return null;
  }

  return { root, segments };
}

export function resolveReference(raw: string, scope: ReferenceScope): unknown {
  const parsed = parseReference(raw);
  if (!parsed) return undefined;
  const ctx = resolveRoot(parsed.root, scope);
  if (ctx === undefined) return undefined;

  let current: any = ctx;
  for (const segment of parsed.segments) {
    if (current == null) return undefined;
    if (typeof segment === 'number') {
      if (!Array.isArray(current) && typeof current !== 'object') return undefined;
      current = current?.[segment as any];
    } else {
      current = (current as any)[segment];
    }
  }
  return current;
}

export function referenceRoot(raw: string): string | null {
  const parsed = parseReference(raw);
  return parsed ? parsed.root : null;
}

export function referenceQueryId(raw: string): string | null {
  const parsed = parseReference(raw);
  if (!parsed || parsed.root !== 'queries') return null;
  const first = parsed.segments[0];
  return typeof first === 'string' ? first : null;
}

export function isReferenceExpression(raw: string): boolean {
  return parseReference(raw) !== null;
}

function resolveRoot(root: string, scope: ReferenceScope): unknown {
  if (!root) return undefined;
  if (root === 'queries') return scope.queries;
  if (root === 'globals') return scope.globals;
  if (scope.globals && Object.prototype.hasOwnProperty.call(scope.globals, root)) {
    return (scope.globals as any)[root];
  }
  return undefined;
}

function isIdentifierChar(ch: string, isFirst: boolean): boolean {
  if (isFirst) {
    return /[A-Za-z_]/.test(ch);
  }
  return /[A-Za-z0-9_\-]/.test(ch);
}
