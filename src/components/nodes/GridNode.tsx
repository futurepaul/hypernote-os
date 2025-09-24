import { Fragment, type CSSProperties } from "react";
import type { Node, RenderNodesFn } from "./types";

type Props = {
  node: Node;
  globals: any;
  queries: Record<string, any>;
  windowId: string;
  errors?: Record<string, string>;
  debug?: boolean;
  renderNodes: RenderNodesFn;
};

export function GridNode({
  node,
  globals,
  queries,
  windowId,
  errors,
  debug,
  renderNodes,
}: Props) {
  const data = (node as any).data || {};
  const style: CSSProperties = { display: 'grid' };

  const columns = normalizeTracks(data.columns ?? data.cols);
  const rows = normalizeTracks(data.rows ?? data.row);
  const gap = normalizeLength(data.gap);
  const columnGap = normalizeLength(data.columnGap ?? data.colGap);
  const rowGap = normalizeLength(data.rowGap ?? data.lineGap);

  if (columns && columns !== 'auto') style.gridTemplateColumns = columns;
  if (rows && rows !== 'auto') style.gridTemplateRows = rows;
  if (gap) style.gap = gap;
  if (columnGap) style.columnGap = columnGap;
  if (rowGap) style.rowGap = rowGap;
  if (data.width) style.width = String(data.width);
  if (data.height) style.height = String(data.height);
  if (data.justifyItems) style.justifyItems = String(data.justifyItems);
  if (data.alignItems) style.alignItems = String(data.alignItems);
  if (data.justifyContent) style.justifyContent = String(data.justifyContent);
  if (data.alignContent) style.alignContent = String(data.alignContent);

  const className = typeof data.className === 'string' && data.className.trim()
    ? `grid ${data.className.trim()}`
    : 'grid';

  const children = Array.isArray((node as any).children) ? ((node as any).children as Node[]) : [];

  if (debug) {
    console.log('[GridNode] render', {
      columns,
      rows,
      gap,
      childCount: children.length,
    });
  }

  return (
    <div className={className} style={style}>
      {children.map((child, index) => (
        <Fragment key={child.id ?? index}>
          {renderNodes({
            nodes: [child],
            globals,
            windowId,
            queries,
            errors,
            inline: true,
            debug,
          })}
        </Fragment>
      ))}
    </div>
  );
}

function normalizeTracks(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const count = Math.max(1, Math.floor(value));
    return `repeat(${count}, minmax(0, 1fr))`;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  return undefined;
}

function normalizeLength(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value}px`;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  return undefined;
}
