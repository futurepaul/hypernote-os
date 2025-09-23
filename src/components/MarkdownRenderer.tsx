import { Fragment, type ReactNode } from "react";
import type { JSX } from "react";
import { interpolate as interp } from "../interp/interpolate";
import { resolveReference } from "../interp/reference";

export type MarkdownScope = { globals: any; queries: Record<string, any> };

export function renderMarkdownAst(nodes: any[], scope: MarkdownScope, keyPrefix = "md"): ReactNode {
  if (!Array.isArray(nodes)) return null;
  return renderBlockNodes(nodes, scope, keyPrefix);
}

function renderBlockNodes(nodes: any[], scope: MarkdownScope, keyPrefix: string): ReactNode {
  return nodes.map((node, index) => renderBlockNode(node, scope, `${keyPrefix}-${index}`));
}

function renderBlockNode(node: any, scope: MarkdownScope, key: string): ReactNode {
  if (!node || typeof node !== "object") return null;
  switch (node.type) {
    case "root":
      return <Fragment key={key}>{renderBlockNodes(node.children || [], scope, key)}</Fragment>;
    case "paragraph":
      return <p key={key} className="leading-relaxed text-sm text-gray-900">{renderInlineChildren(node.children || [], scope, `${key}-p`)}</p>;
    case "heading": {
      const depth = Math.min(6, Math.max(1, Number(node.depth) || 1));
      const Tag = `h${depth}` as keyof JSX.IntrinsicElements;
      const classes: Record<number, string> = {
        1: "text-xl font-semibold text-gray-900 mt-4 mb-2",
        2: "text-lg font-semibold text-gray-900 mt-4 mb-2",
        3: "text-base font-semibold text-gray-900 mt-3 mb-1.5",
        4: "text-base font-medium text-gray-900 mt-2.5 mb-1",
        5: "text-sm font-medium text-gray-900 mt-2 mb-1",
        6: "text-sm font-medium text-gray-900 mt-2 mb-1",
      };
      return <Tag key={key} className={classes[depth] || classes[4]}>{renderInlineChildren(node.children || [], scope, `${key}-h`)}</Tag>;
    }
    case "list": {
      const Tag = (node.ordered ? "ol" : "ul") as keyof JSX.IntrinsicElements;
      const listClass = node.ordered
        ? "list-decimal pl-5 space-y-1 text-sm text-gray-900"
        : "list-disc pl-5 space-y-1 text-sm text-gray-900";
      return <Tag key={key} className={listClass}>{renderBlockNodes(node.children || [], scope, `${key}-li`)}</Tag>;
    }
    case "listItem":
      return <li key={key}>{renderBlockNodes(node.children || [], scope, `${key}-c`)}</li>;
    case "blockquote":
      return <blockquote key={key}>{renderBlockNodes(node.children || [], scope, `${key}-bq`)}</blockquote>;
    case "thematicBreak":
      return <hr key={key} />;
    case "code":
      return (
        <pre
          key={key}
          className="bg-white/10 text-sm text-gray-900 rounded border border-gray-300 overflow-x-auto p-3"
        >
          <code className="font-mono">{interpolateScalar(node.value, scope)}</code>
        </pre>
      );
    default:
      return <Fragment key={key}>{renderInlineNode(node, scope, key)}</Fragment>;
  }
}

function renderInlineChildren(children: any[], scope: MarkdownScope, keyPrefix: string): ReactNode {
  const out: ReactNode[] = [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child && child.type === "imageReference") {
      const next = children[i + 1];
      const url = extractUrlFromSibling(next, scope);
      if (url) {
        out.push(
          <img key={`${keyPrefix}-img-${i}`} src={url} alt={child.alt || child.identifier || ""} />
        );
        i += 1;
        continue;
      }
    }
    out.push(renderInlineNode(child, scope, `${keyPrefix}-${i}`));
  }
  return out;
}

function renderInlineNode(node: any, scope: MarkdownScope, key: string): ReactNode {
  if (!node || typeof node !== "object") return null;
  switch (node.type) {
    case "text":
      return <Fragment key={key}>{interpolateScalar(node.value, scope)}</Fragment>;
    case "strong":
      return <strong key={key}>{renderInlineChildren(node.children || [], scope, `${key}-s`)}</strong>;
    case "emphasis":
      return <em key={key}>{renderInlineChildren(node.children || [], scope, `${key}-e`)}</em>;
    case "inlineCode":
      return (
        <code
          key={key}
          className="font-mono text-[13px] px-1.5 py-0.5 bg-white/10 border border-gray-300 rounded text-gray-900"
        >
          {interpolateScalar(node.value, scope)}
        </code>
      );
    case "break":
      return <br key={key} />;
    case "link": {
      const href = interpolateAttribute(node.url ?? node.href ?? "", scope);
      return (
        <a key={key} href={href} target="_blank" rel="noreferrer">
          {renderInlineChildren(node.children || [], scope, `${key}-l`)}
        </a>
      );
    }
    case "image": {
      const rawUrl = typeof node.url === "string" ? node.url : "";
      const src = interpolateAttribute(rawUrl, scope);
      const altRaw = interpolateScalar(node.alt ?? "", scope);
      const alt = altRaw.length ? altRaw : undefined;
      const width = extractWidthFromUrl(src, rawUrl);
      const props: Record<string, any> = { src };
      if (alt !== undefined) props.alt = alt;
      if (width) props.width = width;
      return <img key={key} {...props} />;
    }
    case "delete":
      return <del key={key}>{renderInlineChildren(node.children || [], scope, `${key}-d`)}</del>;
    default:
      if (Array.isArray(node.children)) {
        return <Fragment key={key}>{renderInlineChildren(node.children, scope, key)}</Fragment>;
      }
      return null;
  }
}

function extractUrlFromSibling(node: any, scope: MarkdownScope): string | null {
  if (!node || node.type !== "text") return null;
  const raw = typeof node.value === "string" ? node.value : "";
  const match = raw.match(/^\s*\((.*)\)\s*$/);
  if (!match) return null;
  const inner = match[1] || "";
  const interpolated = interpolateTemplate(inner, scope);
  return interpolated.trim().length ? interpolated : null;
}

function interpolateScalar(value: unknown, scope: MarkdownScope): string {
  const raw = typeof value === "string" ? value : "";
  return interpolateTemplate(raw, scope);
}

function interpolateAttribute(value: unknown, scope: MarkdownScope): string {
  const raw = typeof value === "string" ? value : "";
  const viaTemplate = interpolateTemplate(raw, scope);
  if (viaTemplate !== raw) return viaTemplate;
  const resolved = resolveReference(raw.trim(), scope);
  if (resolved != null && resolved !== undefined) return String(resolved);
  return viaTemplate;
}

function interpolateTemplate(text: string, scope: MarkdownScope): string {
  return interp(text, scope);
}

function extractWidthFromUrl(resolved: string, raw: string): number | undefined {
  const fromResolved = matchWidth(resolved);
  if (fromResolved) return fromResolved;
  const fromRaw = matchWidth(raw);
  if (fromRaw) return fromRaw;
  return undefined;
}

function matchWidth(value: string): number | undefined {
  if (!value) return undefined;
  const match = value.match(/[?&]w=(\d+)/);
  if (!match) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : undefined;
}
