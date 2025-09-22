import YAML from "yaml";
import { markdown } from "very-small-parser";
import { toText as markdownToText } from "very-small-parser/lib/markdown/block/toText";
import { sanitizeStackConfig } from "./lib/layout";
import { isReferenceExpression } from "./interp/reference";

export type UiNode = {
  id: string;
  type: "markdown" | "button" | "input" | "hstack" | "vstack" | "each" | "markdown_editor";
  children?: UiNode[];
  markdown?: any;
  text?: string;
  data?: any;
  refs?: string[]; // variable references (e.g., queries.profile.name, user.pubkey, time.now)
};

export interface HypernoteMeta {
  hypernote?: Record<string, any>;
  queries?: Record<string, any>;
  actions?: Record<string, any>;
  components?: Record<string, any>;
  events?: Record<string, any>;
  [key: string]: any;
}

export type CompiledDoc = {
  meta: HypernoteMeta;
  ast: UiNode[];
};

function parseFrontmatter(tokens: any[]): { meta: Record<string, any>; body: any[] } {
  let meta: Record<string, any> = {};
  const body: any[] = [];
  for (const t of tokens) {
    if (t.type === "metadata" && (t.fence === undefined || t.fence === "---")) {
      try {
        meta = YAML.parse(t.value || "") || {};
      } catch {}
      continue;
    }
    body.push(t);
  }
  return { meta, body };
}

function safeParseYamlBlock(raw: string): any {
  let data: any = undefined;
  try {
    data = YAML.parse(raw);
  } catch {}
  if (!data || typeof data !== "object") {
    data = {} as any;
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_.-]+)\s*:\s*(.*)$/);
      if (m) data[String(m[1] ?? '')] = m[2];
    }
    if (!data.text) data.text = raw;
  }
  return data;
}

export function compileMarkdownDoc(md: string): CompiledDoc {
  // Pre-parse frontmatter to be resilient to generators
  let meta: Record<string, any> = {}
  let source = md || ''
  if (source.startsWith('---\n')) {
    const idx = source.indexOf('\n---\n', 4)
    if (idx !== -1) {
      try { meta = YAML.parse(source.slice(4, idx)) || {} } catch {}
      source = source.slice(idx + 5)
    }
  }
  const templates = maskTemplatePlaceholders(source)
  source = ensureBlankLineBeforeFences(templates.masked)
  const mdast = markdown.block.parse(source);
  const tokens = Array.isArray(mdast) ? mdast : [mdast];
  const parsed = parseFrontmatter(tokens);
  // Merge token-derived meta (if any) with pre-parsed
  meta = { ...(parsed.meta || {}), ...meta }
  const body = parsed.body

  // id generator for nodes
  let nextId = 1;
  const genId = () => String(nextId++);

  type Frame = { node: UiNode; group: any[] };
  const root: UiNode = { id: genId(), type: "vstack", children: [] };
  const stack: Frame[] = [{ node: root, group: [] }];

const flush = () => {
  const frame = stack[stack.length - 1]!;
  if (!frame.group.length) return;
    assertNoHtml(frame.group);
    const cloned = cloneMarkdownNodes(frame.group);
    const normalized = normalizeMarkdownAst(cloned);
    const restored = restoreTemplatePlaceholders(normalized, templates.map);
    const text = restoreTemplateText(markdownToText(restored), templates.map);
    const refs = extractRefs(text);
    (frame.node.children as UiNode[]).push({ id: genId(), type: "markdown", markdown: restored, text, refs });
    frame.group = [];
  };

  const pushNode = (n: UiNode) => {
    const fr = stack[stack.length - 1];
    if (!fr) return;
    (fr.node.children as UiNode[]).push(n);
  };

  for (const t of body) {
    if (t.type === "code") {
      const langRaw = (t.lang || "").trim();
      const info = langRaw.toLowerCase();
      if (info === "button") {
        flush();
        const rawBlock = (t.value || "").trim();
        const parsed = safeParseYamlBlock(rawBlock);
        const data = restoreTemplateData(parsed, templates.map);
        pushNode({ id: genId(), type: "button", data });
        continue;
      }
      if (info === "input") {
        flush();
        const rawBlock = (t.value || "").trim();
        const parsed = safeParseYamlBlock(rawBlock);
        const data = restoreTemplateData(parsed, templates.map);
        pushNode({ id: genId(), type: "input", data });
        continue;
      }
      if (info === "markdown-editor" || info === "markdown_editor") {
        flush();
        const rawBlock = (t.value || "").trim();
        const parsed = safeParseYamlBlock(rawBlock);
        const data = restoreTemplateData(parsed, templates.map);
        pushNode({ id: genId(), type: "markdown_editor", data });
        continue;
      }
      if (info === "hstack start" || info === "hstack.start") {
        flush();
        const raw = (t.value || "").trim();
        const parsed = raw ? safeParseYamlBlock(raw) : undefined;
        const restored = parsed !== undefined ? restoreTemplateData(parsed, templates.map) : undefined;
        const data = restored ? sanitizeStackConfig(restored) : undefined;
        const node: UiNode = { id: genId(), type: "hstack", children: [] };
        if (data) node.data = data;
        pushNode(node);
        stack.push({ node, group: [] });
        continue;
      }
      if (info === "vstack start" || info === "vstack.start") {
        flush();
        const raw = (t.value || "").trim();
        const parsed = raw ? safeParseYamlBlock(raw) : undefined;
        const restored = parsed !== undefined ? restoreTemplateData(parsed, templates.map) : undefined;
        const data = restored ? sanitizeStackConfig(restored) : undefined;
        const node: UiNode = { id: genId(), type: "vstack", children: [] };
        if (data) node.data = data;
        pushNode(node);
        stack.push({ node, group: [] });
        continue;
      }
      if (info === "each" || info === "each start" || info === "each.start") {
        flush();
        const rawBlock = (t.value || "").trim();
        const parsed = safeParseYamlBlock(rawBlock);
        const data = restoreTemplateData(parsed, templates.map);
        let source = String((data?.from ?? data?.source) || 'queries.items');
        let as = String(data?.as || 'item');
        if (as.startsWith('$')) as = as.slice(1);
        const node: UiNode = { id: genId(), type: "each", children: [], data: { source, as } };
        pushNode(node);
        stack.push({ node, group: [] });
        continue;
      }
      if (info === "each end" || info === "each.end") {
        flush();
        if (stack.length > 1) stack.pop();
        continue;
      }
      if (info === "hstack end" || info === "hstack.end" || info === "vstack end" || info === "vstack.end") {
        flush();
        if (stack.length > 1) stack.pop();
        continue;
      }
      // Unknown fence — treat as normal markdown (rendered by toHast)
      const fr = stack[stack.length - 1];
      if (fr) fr.group.push(t);
    } else if (t.type === "metadata") {
      // already handled
      continue;
    } else {
      const fr2 = stack[stack.length - 1];
      if (fr2) fr2.group.push(t);
    }
  }

  for (let i = stack.length - 1; i >= 0; i--) {
    const frame = stack[i]!;
    if (frame.group.length) {
      assertNoHtml(frame.group);
      const cloned = cloneMarkdownNodes(frame.group);
      const normalized = normalizeMarkdownAst(cloned);
      const restored = restoreTemplatePlaceholders(normalized, templates.map);
      const text = restoreTemplateText(markdownToText(restored), templates.map);
      const refs = extractRefs(text);
      (frame.node.children as UiNode[]).push({ id: genId(), type: "markdown", markdown: restored, text, refs });
      frame.group = [];
    }
  }

  const normalizedMeta = normalizeMeta(meta)
  if (normalizedMeta.queries) assertNoLegacyQueryRefs(normalizedMeta.queries)

  return { meta: normalizedMeta, ast: root.children || [] };
}

export default compileMarkdownDoc;

// Extract variable references from a rendered HTML chunk
function extractRefs(text: string): string[] {
  const refs = new Set<string>();
  const moustache = /{{\s*([^}]+)\s*}}/g;
  let m: RegExpExecArray | null;
  while ((m = moustache.exec(text)) !== null) {
    const expr = String(m[1] ?? '').trim();
    if (!expr) continue;
    const parts = expr.split('||').map(part => part.trim()).filter(Boolean);
    const candidates = parts.length ? parts : [''];
    for (const part of candidates) {
      if (!part) continue;
      if (isReferenceExpression(part)) refs.add(part);
    }
  }
  return Array.from(refs);
}

function cloneMarkdownNodes(nodes: any[]): any {
  return JSON.parse(JSON.stringify(nodes));
}

function normalizeMarkdownAst(nodes: any[]): any[] {
  return nodes.map(node => {
    if (!node || typeof node !== 'object') return node;
    const clone: any = { ...node };
    if (Array.isArray(node.children)) clone.children = normalizeMarkdownAst(node.children);
    if (clone.type === 'paragraph' && Array.isArray(clone.children)) {
      clone.children = mergeImageReferences(clone.children);
    }
    if (Array.isArray(clone.children)) {
      clone.children = normalizeTemplateArtifacts(clone.children);
    }
    return clone;
  });
}

function mergeImageReferences(children: any[]): any[] {
  const out: any[] = [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child && child.type === 'imageReference') {
      const next = children[i + 1];
      const url = extractInlineReferenceUrl(next);
      if (url) {
        out.push({ type: 'image', url, alt: child.alt || child.identifier || '' });
        i += 1;
        continue;
      }
    }
    out.push(child);
  }
  return out;
}

function extractInlineReferenceUrl(node: any): string | null {
  if (!node || node.type !== 'text') return null;
  const raw = typeof node.value === 'string' ? node.value : '';
  const match = raw.match(/^\s*\((.*)\)\s*$/);
  if (!match) return null;
  return (match[1] || '').trim();
}

function assertNoHtml(nodes: any[]) {
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    const type = String((node as any).type || '').toLowerCase();
    if (type.includes('html') || type === 'element') {
      throw new Error('Raw HTML is not supported in markdown blocks.');
    }
    if (Array.isArray((node as any).children)) assertNoHtml((node as any).children);
  }
}

function normalizeTemplateArtifacts(children: any[]): any[] {
  const out: any[] = [];
  for (let i = 0; i < children.length; ) {
    const child = children[i];
    if (!nodeContainsTemplateDelimiter(child)) {
      out.push(child);
      i += 1;
      continue;
    }
    let j = i;
    let combined = '';
    while (j < children.length && nodeContainsTemplateDelimiter(children[j])) {
      combined += extractNodeText(children[j]);
      j += 1;
    }
    const segments = splitTemplateSegments(combined);
    for (const segment of segments) {
      if (!segment.value) continue;
      out.push({ type: 'text', value: segment.value });
    }
    i = j;
  }
  return out;
}

type TemplateMaskState = {
  masked: string;
  map: Map<string, string>;
};

function maskTemplatePlaceholders(source: string): TemplateMaskState {
  const map = new Map<string, string>();
  let counter = 0;
  const masked = source.replace(/{{[\s\S]*?}}/g, (match) => {
    const key = `MPLACE${counter++}X`;
    map.set(key, match);
    return key;
  });
  return { masked, map };
}

function restoreTemplatePlaceholders(node: any, map: Map<string, string>): any {
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

function restoreTemplateText(text: string, map: Map<string, string>): string {
  if (typeof text !== 'string' || !text) return typeof text === 'string' ? text : '';
  let out = text;
  for (const [token, value] of map.entries()) {
    if (out.includes(token)) {
      out = out.split(token).join(value);
    }
  }
  return out;
}

function restoreTemplateData<T>(value: T, map: Map<string, string>): T {
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

function ensureBlankLineBeforeFences(source: string): string {
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

function normalizeMeta(meta: Record<string, any> | null | undefined): HypernoteMeta {
  const hypernote: Record<string, any> = {}
  const queries: Record<string, any> = {}
  const actions: Record<string, any> = {}
  const components: Record<string, any> = {}
  const events: Record<string, any> = {}
  const passthrough: Record<string, any> = {}

  if (meta && typeof meta.hypernote === 'object' && meta.hypernote) {
    Object.assign(hypernote, meta.hypernote)
  }

  const mergeQueries = (record: Record<string, any> | null | undefined) => {
    if (!record || typeof record !== 'object') return
    for (const [rawKey, value] of Object.entries(record)) {
      if (value === undefined) continue
      const key = String(rawKey || '').trim()
      if (!key) continue
      queries[key] = value
    }
  }

  const mergeActions = (record: Record<string, any> | null | undefined) => {
    if (!record || typeof record !== 'object') return
    for (const [rawKey, value] of Object.entries(record)) {
      if (value === undefined) continue
      const key = String(rawKey || '').trim()
      if (!key) continue
      actions[key] = value
    }
  }

  const mergeComponents = (record: Record<string, any> | null | undefined) => {
    if (!record || typeof record !== 'object') return
    for (const [rawKey, value] of Object.entries(record)) {
      if (value === undefined) continue
      const key = String(rawKey || '').trim()
      if (!key) continue
      const normalizedKey = key.startsWith('#') ? key.slice(1) : key
      components[normalizedKey] = value
    }
  }

  const mergeEvents = (record: Record<string, any> | null | undefined) => {
    if (!record || typeof record !== 'object') return
    for (const [rawKey, value] of Object.entries(record)) {
      if (value === undefined) continue
      const key = String(rawKey || '').trim()
      if (!key) continue
      const normalizedKey = key.startsWith('@') ? key.slice(1) : key
      events[normalizedKey] = value
    }
  }

  if (meta && typeof meta.queries === 'object') mergeQueries(meta.queries)
  if (meta && typeof meta.actions === 'object') mergeActions(meta.actions)
  if (meta && typeof meta.components === 'object') mergeComponents(meta.components)
  if (meta && typeof meta.events === 'object') mergeEvents(meta.events)

  const scalarKeys = new Set(['name', 'icon', 'description', 'version', 'author', 'type'])

  for (const [rawKey, value] of Object.entries(meta || {})) {
    if (value === undefined) continue
    const key = String(rawKey || '')
    if (key === 'hypernote' || key === 'queries' || key === 'actions' || key === 'components' || key === 'events') continue
    if (key.startsWith('#')) {
      mergeComponents({ [key.slice(1)]: value })
      continue
    }
    if (scalarKeys.has(key)) {
      hypernote[key] = value
      continue
    }
    passthrough[key] = value
  }

  const normalized: HypernoteMeta = { ...passthrough }
  if (Object.keys(hypernote).length) normalized.hypernote = hypernote
  if (Object.keys(queries).length) normalized.queries = queries
  if (Object.keys(actions).length) normalized.actions = actions
  if (Object.keys(components).length) normalized.components = components
  if (Object.keys(events).length) normalized.events = events
  return normalized
}

const LEGACY_PLACEHOLDER_PREFIXES = ['$item', '$pubkey', '$event', '$context', '$args', '$arg', '$note'];

function isAllowedPlaceholder(value: string): boolean {
  return LEGACY_PLACEHOLDER_PREFIXES.some(prefix => value === prefix || value.startsWith(`${prefix}.`));
}

function assertNoLegacyQueryRefs(queries: Record<string, any>) {
  const visit = (node: any, path: string[]) => {
    if (Array.isArray(node)) {
      node.forEach((child, index) => visit(child, path.concat(String(index))));
      return;
    }
    if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) visit(value, path.concat(key));
      return;
    }
    if (typeof node !== 'string') return;
    const trimmed = node.trim();
    if (!trimmed.startsWith('$')) return;
    const key = path[path.length - 1] || '';
    if (key === 'from' || key === 'with') {
      if (!trimmed.startsWith('$item.')) {
        throw new Error(`Legacy "$" reference "${trimmed}" found at ${path.join('.')}. Use "queries.${trimmed.slice(1)}" instead.`);
      }
      return;
    }
    if (key === 'authors') {
      if (!isAllowedPlaceholder(trimmed)) {
        throw new Error(`Legacy "$" reference "${trimmed}" found at ${path.join('.')}. Use "queries.${trimmed.slice(1)}" or a supported placeholder.`);
      }
    }
  };

  for (const [name, def] of Object.entries(queries)) visit(def, ['queries', name]);
}

function nodeContainsTemplateDelimiter(node: any): boolean {
  if (!node || typeof node !== 'object') return false;
  const text = extractNodeText(node);
  if (!text) return false;
  return text.includes('{{') || text.includes('}}');
}

function extractNodeText(node: any): string {
  if (!node || typeof node !== 'object') return '';
  if (typeof node.value === 'string') return node.value;
  if (Array.isArray(node.children)) {
    return node.children.map(extractNodeText).join('');
  }
  return '';
}

type TemplateSegment = { type: 'text' | 'template'; value: string };

function splitTemplateSegments(text: string): TemplateSegment[] {
  const segments: TemplateSegment[] = [];
  const regex = /{{[\s\S]*?}}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, idx) });
    }
    segments.push({ type: 'template', value: match[0] ?? '' });
    lastIndex = idx + (match[0]?.length ?? 0);
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return segments;
}
