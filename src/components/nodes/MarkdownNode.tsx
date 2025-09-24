import { useMemo, useCallback } from "react";
import { renderMarkdownAst, type MarkdownScope } from "../MarkdownRenderer";
import { useAction } from "../../state/actions";
import { resolveReference } from "../../interp/reference";
import type { Node } from "./types";
import { buildSwitchPayloadFromNostrUri } from "./utils";

type Props = {
  n: Node;
  globals: any;
  queries: Record<string, any>;
  windowId: string;
};

export function MarkdownNode({ n, globals, queries, windowId }: Props) {
  const deps = useMemo(() => {
    const rawRefs = Array.isArray(n.refs) ? (n.refs as unknown[]) : [];
    const refs = rawRefs.filter((ref): ref is string => typeof ref === 'string');
    return refs.map((ref) => JSON.stringify(resolveReference(ref, { globals, queries }) ?? ''));
  }, [n.refs, queries, globals]);

  const scope = useMemo<MarkdownScope>(() => ({ globals, queries }), [globals, queries]);
  const switchApp = useAction('system.switch_app', windowId);
  const handleNostrLink = useCallback((href: string) => {
    if (!switchApp) return false;
    const payload = buildSwitchPayloadFromNostrUri(href);
    if (!payload) return false;
    switchApp(payload, { windowId, globals, queries }).catch(err => console.warn('nostr link action failed', err));
    return true;
  }, [switchApp, windowId, globals, queries]);

  const content = useMemo(() => {
    const tokens = Array.isArray(n.markdown) ? n.markdown : [];
    return renderMarkdownAst(tokens, scope, { onNostrLink: handleNostrLink });
  }, [n.id, scope, handleNostrLink, ...deps]);

  return <div className="app-markdown">{content}</div>;
}
