import YAML from "yaml";
import { markdown } from "very-small-parser";
import { toHast } from "very-small-parser/lib/markdown/block/toHast";
import { toText as htmlToText } from "very-small-parser/lib/html/toText";

export type UiNode = {
  type: "html" | "button" | "input" | "hstack" | "vstack";
  children?: UiNode[];
  html?: string;
  data?: any;
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
    data = {} as any;
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_.-]+)\s*:\s*(.*)$/);
      if (m) data[m[1]] = m[2];
    }
    if (!data.text) data.text = raw;
  }
  return data;
}

export function compileMarkdownDoc(md: string): CompiledDoc {
  const mdast = markdown.block.parse(md || "");
  const tokens = Array.isArray(mdast) ? mdast : [mdast];
  const { meta, body } = parseFrontmatter(tokens);

  type Frame = { node: UiNode; group: any[] };
  const root: UiNode = { type: "vstack", children: [] };
  const stack: Frame[] = [{ node: root, group: [] }];

  const flush = () => {
    const frame = stack[stack.length - 1];
    if (!frame.group.length) return;
    const hast = toHast(frame.group);
    const html = htmlToText(hast);
    (frame.node.children as UiNode[]).push({ type: "html", html });
    frame.group = [];
  };

  const pushNode = (n: UiNode) => {
    (stack[stack.length - 1].node.children as UiNode[]).push(n);
  };

  for (const t of body) {
    if (t.type === "code") {
      const info = (t.lang || "").trim().toLowerCase();
      if (info === "button") {
        flush();
        const data = safeParseYamlBlock((t.value || "").trim());
        pushNode({ type: "button", data });
        continue;
      }
      if (info === "input") {
        flush();
        const data = safeParseYamlBlock((t.value || "").trim());
        pushNode({ type: "input", data });
        continue;
      }
      if (info === "hstack start" || info === "hstack.start") {
        flush();
        const node: UiNode = { type: "hstack", children: [] };
        pushNode(node);
        stack.push({ node, group: [] });
        continue;
      }
      if (info === "vstack start" || info === "vstack.start") {
        flush();
        const node: UiNode = { type: "vstack", children: [] };
        pushNode(node);
        stack.push({ node, group: [] });
        continue;
      }
      if (info === "hstack end" || info === "hstack.end" || info === "vstack end" || info === "vstack.end") {
        flush();
        if (stack.length > 1) stack.pop();
        continue;
      }
      // Unknown fence — treat as normal markdown (rendered by toHast)
      stack[stack.length - 1].group.push(t);
    } else if (t.type === "metadata") {
      // already handled
      continue;
    } else {
      stack[stack.length - 1].group.push(t);
    }
  }

  for (let i = stack.length - 1; i >= 0; i--) {
    const frame = stack[i];
    if (frame.group.length) {
      const hast = toHast(frame.group);
      const html = htmlToText(hast);
      (frame.node.children as UiNode[]).push({ type: "html", html });
      frame.group = [];
    }
  }

  return { meta, ast: root.children || [] };
}

export default compileMarkdownDoc;

