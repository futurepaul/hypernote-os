import YAML from "yaml";
import { markdown } from "very-small-parser";
import { toHast } from "very-small-parser/lib/markdown/block/toHast";
import { toText as htmlToText } from "very-small-parser/lib/html/toText";

export type UiNode = {
  id: string;
  type: "html" | "button" | "input" | "hstack" | "vstack" | "each";
  children?: UiNode[];
  html?: string;
  data?: any;
  refs?: string[]; // variable references (e.g., $profile.name, user.pubkey, time.now)
};

export type CompiledDoc = {
  meta: Record<string, any>;
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
    const root: any = {};
    const stack: Array<{ indent: number; target: any }> = [{ indent: -1, target: root }];
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) continue;
      const match = line.match(/^(\s*)([A-Za-z0-9_.-]+)\s*:\s*(.*)$/);
      if (!match) continue;
      const indent = match[1]?.length ?? 0;
      const key = String(match[2] ?? '');
      const value = match[3] ?? '';
      while (stack.length && indent <= stack[stack.length - 1]!.indent) stack.pop();
      const parent = stack[stack.length - 1]?.target ?? root;
      if (value === '') {
        parent[key] = {};
        stack.push({ indent, target: parent[key] });
      } else {
        parent[key] = value;
      }
    }
    data = root;
    if (!Object.keys(data).length) data.text = raw;
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
    const hast = toHast(frame.group);
    const html = htmlToText(hast) as string;
    const refs = extractRefs(html);
    (frame.node.children as UiNode[]).push({ id: genId(), type: "html", html, refs });
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
        const data = safeParseYamlBlock((t.value || "").trim());
        pushNode({ id: genId(), type: "button", data });
        continue;
      }
      if (info === "input") {
        flush();
        const data = safeParseYamlBlock((t.value || "").trim());
        pushNode({ id: genId(), type: "input", data });
        continue;
      }
      if (info === "hstack start" || info === "hstack.start") {
        flush();
        const node: UiNode = { id: genId(), type: "hstack", children: [] };
        pushNode(node);
        stack.push({ node, group: [] });
        continue;
      }
      if (info === "vstack start" || info === "vstack.start") {
        flush();
        const node: UiNode = { id: genId(), type: "vstack", children: [] };
        pushNode(node);
        stack.push({ node, group: [] });
        continue;
      }
      if (info === "each") {
        flush();
        const data = safeParseYamlBlock((t.value || "").trim());
        let source = String((data?.from ?? data?.source) || '$items');
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
      const hast = toHast(frame.group);
      const html = htmlToText(hast) as string;
      const refs = extractRefs(html);
      (frame.node.children as UiNode[]).push({ id: genId(), type: "html", html, refs });
      frame.group = [];
    }
  }

  return { meta, ast: root.children || [] };
}

export default compileMarkdownDoc;

// Extract variable references from a rendered HTML chunk
function extractRefs(html: string): string[] {
  const refs = new Set<string>();
  // Mustache-like tokens already interpolated later
  const re = /{{\s*([$]?[a-zA-Z0-9_.-]+)\s*}}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) if (m[1]) refs.add(String(m[1]));
  // $query.path inside img src or elsewhere
  const reDollar = /(\$[a-zA-Z0-9_.-]+)/g;
  while ((m = reDollar.exec(html)) !== null) if (m[1]) refs.add(String(m[1]));
  return Array.from(refs);
}
