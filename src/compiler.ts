import YAML from "yaml";
import { markdown } from "very-small-parser";
import { toText as markdownToText } from "very-small-parser/lib/markdown/block/toText";
import {
  splitFrontmatter,
  safeParseYamlBlock,
  maskTemplatePlaceholders,
  restoreTemplatePlaceholders,
  restoreTemplateText,
  restoreTemplateData,
  ensureBlankLineBeforeFences,
} from "./compiler/utils";
import { sanitizeStackConfig } from "./lib/layout";
import { isReferenceExpression, parseReference } from "./interp/reference";
import type { DocIR, UiNode as SchemaUiNode } from "./types/doc";
import { validateDoc } from "./types/doc";

export const DOC_VERSION = "1.2.0";

export type UiNode = SchemaUiNode;
export type HypernoteMeta = DocIR["meta"];
export type CompiledDoc = DocIR;

type NodeDeps = NonNullable<UiNode["deps"]>;

const MOUSTACHE_EXPRESSION = /{{\s*([^}]+)\s*}}/g;

function deriveDepsFromRefs(refs: Iterable<string>): NodeDeps | undefined {
  const queryIds = new Set<string>();
  const globals = new Set<string>();
  for (const ref of refs) {
    const parsed = parseReference(ref);
    if (!parsed) continue;
    if (parsed.root === 'queries') {
      const first = parsed.segments[0];
      if (typeof first === 'string' && first) queryIds.add(first);
    } else {
      globals.add(parsed.root);
    }
  }
  // Debug helper: uncomment for dependency tracing.
  // console.log('deriveDepsFromRefs', Array.from(refs), Array.from(queryIds), Array.from(globals));
  if (!queryIds.size && !globals.size) return undefined;
  const deps: NodeDeps = {};
  if (queryIds.size) deps.queries = Array.from(queryIds).sort();
  if (globals.size) deps.globals = Array.from(globals).sort();
  return deps;
}

function deriveDepsFromData(value: any): NodeDeps | undefined {
  if (value === undefined || value === null) return undefined;
  const refs = new Set<string>();
  collectRefsFromValue(value, refs);
  if (!refs.size) return undefined;
  return deriveDepsFromRefs(refs);
}

function collectRefsFromValue(value: any, out: Set<string>) {
  if (typeof value === 'string') {
    collectRefsFromString(value, out);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectRefsFromValue(entry, out);
    return;
  }
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) collectRefsFromValue(entry, out);
  }
}

function collectRefsFromString(raw: string, out: Set<string>) {
  if (!raw) return;
  const trimmed = raw.trim();
  if (isReferenceExpression(trimmed)) {
    out.add(trimmed);
  }
  let match: RegExpExecArray | null;
  MOUSTACHE_EXPRESSION.lastIndex = 0;
  while ((match = MOUSTACHE_EXPRESSION.exec(raw)) !== null) {
    const inner = String(match[1] ?? '').trim();
    if (!inner) continue;
    const options = inner.split('||').map(part => part.trim()).filter(Boolean);
    const targets = options.length ? options : [inner];
    for (const target of targets) {
      const head = target.split('|', 1)[0]?.trim();
      if (head && isReferenceExpression(head)) out.add(head);
    }
  }
}

function mergeNodeDeps(base: NodeDeps | undefined, next: NodeDeps | undefined): NodeDeps | undefined {
  if (!next) return base;
  const queries = new Set<string>(base?.queries ?? []);
  const globals = new Set<string>(base?.globals ?? []);
  for (const id of next.queries ?? []) queries.add(id);
  for (const id of next.globals ?? []) globals.add(id);
  const result: NodeDeps = {};
  if (queries.size) result.queries = Array.from(queries).sort();
  if (globals.size) result.globals = Array.from(globals).sort();
  return result.queries || result.globals ? result : undefined;
}

function ensureDepsRecursive(nodes: UiNode[]): void {
  for (const node of nodes) {
    let deps = node.deps;
    if (Array.isArray((node as any).refs) && (node as any).refs.length) {
      deps = mergeNodeDeps(deps, deriveDepsFromRefs((node as any).refs));
    }
    if ((node as any).data !== undefined) {
      deps = mergeNodeDeps(deps, deriveDepsFromData((node as any).data));
    }
    if (deps && (deps.queries?.length || deps.globals?.length)) {
      node.deps = deps;
    } else {
      if (node.deps) delete node.deps;
    }
    if (Array.isArray((node as any).children)) {
      ensureDepsRecursive((node.children as UiNode[]) || []);
    }
  }
}

export function compileMarkdownDoc(md: string): CompiledDoc {
  const { meta: rawMeta, body } = splitFrontmatter(md || '')
  const templates = maskTemplatePlaceholders(body)
  const prepared = ensureBlankLineBeforeFences(templates.masked)
  const mdast = markdown.block.parse(prepared);
  const tokens = Array.isArray(mdast) ? mdast : [mdast];
  let meta: Record<string, any> = rawMeta

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
    const deps = deriveDepsFromRefs(refs);
    const node: UiNode = { id: genId(), type: "markdown", markdown: restored, text, refs };
    if (deps) node.deps = deps;
    (frame.node.children as UiNode[]).push(node);
    frame.group = [];
  };

  const pushNode = (n: UiNode) => {
    const fr = stack[stack.length - 1];
    if (!fr) return;
    (fr.node.children as UiNode[]).push(n);
  };

  for (const t of tokens) {
    if (t.type === "code") {
      const langRaw = (t.lang || "").trim();
      const info = langRaw.toLowerCase();
      if (info === "button") {
        flush();
        const rawBlock = (t.value || "").trim();
        const parsed = safeParseYamlBlock(rawBlock);
        const data = restoreTemplateData(parsed, templates.map);
        const deps = deriveDepsFromData(data);
        const node: UiNode = { id: genId(), type: "button", data };
        if (deps) node.deps = deps;
        pushNode(node);
        continue;
      }
      if (info === "input") {
        flush();
        const rawBlock = (t.value || "").trim();
        const parsed = safeParseYamlBlock(rawBlock);
        const data = restoreTemplateData(parsed, templates.map);
        const deps = deriveDepsFromData(data);
        const node: UiNode = { id: genId(), type: "input", data };
        if (deps) node.deps = deps;
        pushNode(node);
        continue;
      }
      if (info === "markdown-editor" || info === "markdown_editor") {
        flush();
        const rawBlock = (t.value || "").trim();
        const parsed = safeParseYamlBlock(rawBlock);
        const data = restoreTemplateData(parsed, templates.map);
        const deps = deriveDepsFromData(data);
        const node: UiNode = { id: genId(), type: "markdown_editor", data };
        if (deps) node.deps = deps;
        pushNode(node);
        continue;
      }
      if (info === "markdown.viewer" || info === "markdown_viewer" || info === "markdown-viewer") {
        flush();
        const rawBlock = (t.value || "").trim();
        const parsed = safeParseYamlBlock(rawBlock);
        const data = restoreTemplateData(parsed, templates.map);
        const deps = deriveDepsFromData(data);
        const node: UiNode = { id: genId(), type: "markdown_viewer", data };
        if (deps) node.deps = deps;
        pushNode(node);
        continue;
      }
      if (info === "hstack.start") {
        flush();
        const raw = (t.value || "").trim();
        const parsed = raw ? safeParseYamlBlock(raw) : undefined;
        const restored = parsed !== undefined ? restoreTemplateData(parsed, templates.map) : undefined;
        const data = restored ? sanitizeStackConfig(restored) : undefined;
        const node: UiNode = { id: genId(), type: "hstack", children: [] };
        if (data) {
          node.data = data;
          const deps = deriveDepsFromData(data);
          if (deps) node.deps = deps;
        }
        pushNode(node);
        stack.push({ node, group: [] });
        continue;
      }
      if (info === "vstack.start") {
        flush();
        const raw = (t.value || "").trim();
        const parsed = raw ? safeParseYamlBlock(raw) : undefined;
        const restored = parsed !== undefined ? restoreTemplateData(parsed, templates.map) : undefined;
        const data = restored ? sanitizeStackConfig(restored) : undefined;
        const node: UiNode = { id: genId(), type: "vstack", children: [] };
        if (data) {
          node.data = data;
          const deps = deriveDepsFromData(data);
          if (deps) node.deps = deps;
        }
        pushNode(node);
        stack.push({ node, group: [] });
        continue;
      }
      if (info === "each.start") {
        flush();
        const rawBlock = (t.value || "").trim();
        const parsed = safeParseYamlBlock(rawBlock);
        const data = restoreTemplateData(parsed, templates.map);
        let source = String((data?.from ?? data?.source) || 'queries.items');
        let as = String(data?.as || 'item');
        if (as.startsWith('$')) as = as.slice(1);
        const nodeData: Record<string, any> = { ...(data || {}), source, as };
        if (Object.prototype.hasOwnProperty.call(nodeData, 'from')) delete (nodeData as any).from;
        const deps = deriveDepsFromData(nodeData);
        const node: UiNode = { id: genId(), type: "each", children: [], data: nodeData };
        if (deps) node.deps = deps;
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
      // Unknown fence — treat as literal code block so documentation can show
      // sample syntax without the compiler trying to interpret it.
      flush();
      const lang = (t.lang || '').trim();
      const value = (t.value || '').replace(/\n$/, '');
      pushNode({
        id: genId(),
        type: 'literal_code' as any,
        text: value,
        data: lang ? { lang } : undefined,
      });
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

  const ast = (root.children || []) as UiNode[]
  ensureDepsRecursive(ast)
  // Capture a per-document summary of query/global usage so the runtime can
  // subscribe only to the streams it needs (e.g. skip $time.now when unused).
  const docDependencies = collectDocDependencies(ast)
  if (docDependencies) {
    normalizedMeta.dependencies = docDependencies
  }
  const candidate: CompiledDoc = validateDoc({
    version: DOC_VERSION,
    meta: normalizedMeta,
    ast,
  })

  return candidate;
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
      const head = part.split('|', 1)[0]?.trim();
      if (head && isReferenceExpression(head)) refs.add(head);
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

function collectDocDependencies(nodes: UiNode[]): { globals?: string[]; queries?: string[] } | undefined {
  if (!nodes?.length) return undefined
  const globals = new Set<string>()
  const queries = new Set<string>()

  const walk = (node: UiNode) => {
    const deps = node.deps
    if (deps?.globals) {
      for (const g of deps.globals) globals.add(g)
    }
    if (deps?.queries) {
      for (const q of deps.queries) queries.add(q)
    }
    if (Array.isArray((node as any).children)) {
      for (const child of (node.children as UiNode[]) || []) walk(child)
    }
  }

  for (const node of nodes) walk(node)

  const result: { globals?: string[]; queries?: string[] } = {}
  if (globals.size) result.globals = Array.from(globals).sort()
  if (queries.size) result.queries = Array.from(queries).sort()
  return result.globals || result.queries ? result : undefined
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
