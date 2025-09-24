import YAML from "yaml";

export type TemplateMaskState = {
  masked: string;
  map: Map<string, string>;
};

const FRONTMATTER_FENCE = /^---\s*$/;

export function splitFrontmatter(source: string): { meta: Record<string, any>; body: string } {
  if (!source) return { meta: {}, body: '' };
  const lines = source.split(/\r?\n/);
  if (!lines.length || !FRONTMATTER_FENCE.test(lines[0] ?? '')) {
    return { meta: {}, body: source };
  }
  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (FRONTMATTER_FENCE.test(lines[i] ?? '')) {
      endIndex = i;
      break;
    }
  }
  if (endIndex === -1) return { meta: {}, body: source };
  const metaLines = lines.slice(1, endIndex).join('\n');
  let meta: Record<string, any> = {};
  try {
    const parsed = YAML.parse(metaLines);
    if (parsed && typeof parsed === 'object') meta = parsed;
  } catch {}
  const body = lines.slice(endIndex + 1).join('\n');
  return { meta, body };
}

export function safeParseYamlBlock(raw: string, context?: string): any {
  try {
    const data = YAML.parse(raw);
    return data ?? {};
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse YAML for ${context ?? 'code block'}: ${message}`);
  }
}

export function maskTemplatePlaceholders(source: string): TemplateMaskState {
  const map = new Map<string, string>();
  let counter = 0;
  const masked = source.replace(/{{[\s\S]*?}}/g, (match) => {
    const key = `MPLACE${counter++}X`;
    map.set(key, match);
    return key;
  });
  return { masked, map };
}

export function restoreTemplatePlaceholders(node: any, map: Map<string, string>): any {
  if (Array.isArray(node)) {
    return node.map((child) => restoreTemplatePlaceholders(child, map));
  }
  if (!node || typeof node !== 'object') return node;
  const clone: any = { ...node };
  for (const key of Object.keys(clone)) {
    const value = clone[key];
    if (typeof value === 'string') {
      clone[key] = restoreTemplateText(value, map);
    } else if (Array.isArray(value)) {
      clone[key] = restoreTemplatePlaceholders(value, map);
    } else if (value && typeof value === 'object') {
      clone[key] = restoreTemplatePlaceholders(value, map);
    }
  }
  return clone;
}

export function restoreTemplateText(text: string, map: Map<string, string>): string {
  if (typeof text !== 'string' || !text) return typeof text === 'string' ? text : '';
  let out = text;
  for (const [token, value] of map.entries()) {
    if (out.includes(token)) {
      out = out.split(token).join(value);
    }
  }
  return out;
}

export function restoreTemplateData<T>(value: T, map: Map<string, string>): T {
  if (typeof value === 'string') return restoreTemplateText(value, map) as unknown as T;
  if (Array.isArray(value)) return value.map(item => restoreTemplateData(item, map)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [key, val] of Object.entries(value as any)) {
      out[key] = restoreTemplateData(val, map);
    }
    return out as unknown as T;
  }
  return value;
}

export function ensureBlankLineBeforeFences(source: string): string {
  const lines = source.split(/\r?\n/);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isFence = line.trimStart().startsWith('```');
    if (isFence && out.length > 0 && out[out.length - 1].trim() !== '') {
      out.push('');
    }
    out.push(line);
  }
  return out.join('\n');
}
