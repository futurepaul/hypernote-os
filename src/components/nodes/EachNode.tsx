import { Fragment } from "react";
import { resolveReference, referenceQueryId } from "../../interp/reference";
import { deriveLoopKey } from "../../lib/render";
import type { Node, RenderNodesFn } from "./types";

type Props = {
  node: Node;
  globals: any;
  windowId: string;
  queries: Record<string, any>;
  errors?: Record<string, string>;
  debug?: boolean;
  renderNodes: RenderNodesFn;
};

export function EachNode({ node, globals, windowId, queries, errors, debug = false, renderNodes }: Props) {
  const data = node.data || {};
  const sourceExpr = typeof data.source === 'string' ? data.source.trim() : 'queries.items';
  const asNameRaw = typeof data.as === 'string' && data.as.length > 0 ? data.as : 'item';
  const asName = asNameRaw.trim() || 'item';
  const listRaw = resolveReference(sourceExpr, { globals, queries });
  const sourceQueryId = referenceQueryId(sourceExpr);
  const errorMessage = sourceQueryId ? errors?.[sourceQueryId] : undefined;
  if (debug) console.log(`[Each] source=${sourceExpr}`, { errorMessage, listRaw });
  if (errorMessage) {
    return <div className="italic text-sm text-red-600">{errorMessage || 'Failed to load.'}</div>;
  }
  if (listRaw === undefined) {
    return <div className="italic text-sm text-gray-600">Loading…</div>;
  }
  const list = Array.isArray(listRaw) ? listRaw : [];
  if (debug) console.log(`[Each] source=${sourceExpr}`, { length: list.length });
  if (!Array.isArray(listRaw)) return null;
  if (!list.length) return null;

  return (
    <>
      {list.map((item, index) => {
        const loopGlobals = {
          ...globals,
          [asName]: item,
          [`${asName}Index`]: index,
        };
        const stableKey = deriveLoopKey(node.id, item, index);
        return (
          <Fragment key={stableKey}>
            {renderNodes({
              nodes: node.children || [],
              globals: loopGlobals,
              windowId,
              queries,
              errors,
              inline: true,
              debug,
            })}
          </Fragment>
        );
      })}
    </>
  );
}
