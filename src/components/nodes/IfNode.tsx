import { useMemo } from "react";
import type { Node, RenderNodesFn } from "./types";
import { buildPayload } from "./utils";
import { referenceQueryId } from "../../interp/reference";

type Props = {
  node: Node;
  truthy: Node[];
  falsy: Node[];
  globals: any;
  queries: Record<string, any>;
  windowId: string;
  errors?: Record<string, string>;
  debug?: boolean;
  renderNodes: RenderNodesFn;
};

export function IfNode({
  node,
  truthy,
  falsy,
  globals,
  queries,
  windowId,
  errors,
  debug,
  renderNodes,
}: Props) {
  const data = (node as any).data ?? {};
  const valueSpec = data?.value ?? data?.source ?? data?.input ?? data?.condition;

  const value = useMemo(() => buildPayload(valueSpec, globals, queries), [valueSpec, globals, queries]);
  const queryId = typeof valueSpec === 'string' ? referenceQueryId(valueSpec.trim()) : undefined;
  const errorMessage = queryId ? errors?.[queryId] : undefined;

  if (debug) {
    console.log('[IfNode] evaluate', { valueSpec, value, queryId, errorMessage });
  }

  if (errorMessage) {
    return <div className="italic text-sm text-red-600">{errorMessage}</div>;
  }

  const shouldRenderTruthy = Boolean(value);
  const branchKey = shouldRenderTruthy ? 'truthy' : 'falsy';
  const branchNodes = shouldRenderTruthy ? truthy : falsy;

  if (branchNodes && branchNodes.length) {
    return (
      <>
        {renderNodes({
          nodes: branchNodes,
          globals,
          windowId,
          queries,
          errors,
          inline: true,
          debug,
        })}
      </>
    );
  }

  if (data && Object.prototype.hasOwnProperty.call(data, branchKey)) {
    const raw = data[branchKey];
    const payload = buildPayload(raw, globals, queries);
    if (payload === undefined || payload === null) return null;
    if (typeof payload === 'object') {
      try {
        return <span>{JSON.stringify(payload)}</span>;
      } catch {
        return <span>{String(payload)}</span>;
      }
    }
    return <span>{String(payload)}</span>;
  }

  return null;
}
