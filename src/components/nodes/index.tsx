import { Component, type ReactNode, type ErrorInfo } from "react";
import type { Node, RenderNodesProps } from "./types";
import { stackStyleFromData } from "./utils";
import { MarkdownNode } from "./MarkdownNode";
import { LiteralCodeBlock } from "./LiteralCodeBlock";
import { ButtonNode } from "./ButtonNode";
import { InputNode } from "./InputNode";
import { JsonViewerNode } from "./JsonViewerNode";
import { MarkdownEditorNode } from "./MarkdownEditorNode";
import { MarkdownViewerNode } from "./MarkdownViewerNode";
import { NoteNode } from "./NoteNode";
import { EachNode } from "./EachNode";
import { IfNode } from "./IfNode";
import { GridNode } from "./GridNode";

export type { Node, RenderNodesProps };

type NodeBoundaryProps = {
  node: Node;
  windowId: string;
  children: ReactNode;
};

type NodeBoundaryState = {
  error: Error | null;
};

class NodeBoundary extends Component<NodeBoundaryProps, NodeBoundaryState> {
  override state: NodeBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): NodeBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    const { node, windowId } = this.props;
    console.warn('[RenderNodes] node error', { windowId, nodeType: node.type, nodeId: node.id, info: info?.componentStack }, error);
  }

  override componentDidUpdate(prevProps: Readonly<NodeBoundaryProps>): void {
    if (this.state.error && (prevProps.node !== this.props.node || prevProps.node.id !== this.props.node.id)) {
      this.setState({ error: null });
    }
  }

  override render(): ReactNode {
    if (this.state.error) {
      const { node } = this.props;
      return (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
          <strong>Failed to render `{node.type}`</strong>
          <div className="mt-1">Check the console for details.</div>
        </div>
      );
    }

    return <>{this.props.children}</>;
  }
}

export function RenderNodes({ nodes, globals, windowId, queries, errors, inline = false, debug = false }: RenderNodesProps) {
  const renderNodeContent = (n: Node, key: number): ReactNode => {
    if (n.type === "markdown") {
      return <MarkdownNode n={n} globals={globals} queries={queries} windowId={windowId} />;
    }
    if (n.type === "button") {
      const buttonData = (n.data ?? {}) as Record<string, unknown>;
      const buttonText = typeof buttonData.text === 'string' ? buttonData.text : '';
      const buttonAction = typeof buttonData.action === 'string' ? buttonData.action : undefined;
      const buttonPayload = buttonData.payload;
      return (
        <ButtonNode
          text={buttonText}
          action={buttonAction}
          globals={globals}
          windowId={windowId}
          queries={queries}
          payloadSpec={buttonPayload}
          data={buttonData}
        />
      );
    }
    if (n.type === "markdown_editor") {
      return (
        <MarkdownEditorNode
          data={n.data}
          windowId={windowId}
        />
      );
    }
    if (n.type === "markdown_viewer") {
      return (
        <MarkdownViewerNode
          data={n.data}
          globals={globals}
          queries={queries}
        />
      );
    }
    if (n.type === "input") {
      const inputData = (n.data ?? {}) as Record<string, unknown>;
      const inputText = typeof inputData.text === 'string' ? inputData.text : '';
      const inputName = typeof inputData.name === 'string' ? inputData.name : undefined;
      return (
        <InputNode
          text={inputText}
          name={inputName}
          globals={globals}
          windowId={windowId}
          queries={queries}
        />
      );
    }
    if (n.type === "hstack" || n.type === "vstack") {
      const style = stackStyleFromData(n.data);
      const childNodes: Node[] = Array.isArray(n.children) ? (n.children as Node[]) : [];
      return (
        <div
          className={n.type === "hstack" ? "flex flex-row gap-2" : "flex flex-col gap-2"}
          style={style}
        >
          {childNodes.map((child, childIndex) => (
            <RenderNodes
              key={`${child.id ?? childIndex}`}
              nodes={[child]}
              globals={globals}
              windowId={windowId}
              queries={queries}
              errors={errors}
              inline
              debug={debug}
            />
          ))}
        </div>
      );
    }
    if (n.type === "each") {
      return (
        <EachNode
          node={n}
          globals={globals}
          windowId={windowId}
          queries={queries}
          errors={errors}
          debug={debug}
          renderNodes={(props) => (
            <RenderNodes
              {...props}
              errors={props.errors ?? errors}
              debug={props.debug ?? debug}
            />
          )}
        />
      );
    }
    if (n.type === "if") {
      const truthyChildren = Array.isArray((n as any).truthy) ? ((n as any).truthy as Node[]) : [];
      const falsyChildren = Array.isArray((n as any).falsy) ? ((n as any).falsy as Node[]) : [];
      return (
        <IfNode
          node={n}
          truthy={truthyChildren}
          falsy={falsyChildren}
          globals={globals}
          queries={queries}
          windowId={windowId}
          errors={errors}
          debug={debug}
          renderNodes={(props) => (
            <RenderNodes
              {...props}
              errors={props.errors ?? errors}
              debug={props.debug ?? debug}
            />
          )}
        />
      );
    }
    if (n.type === "note") {
      return (
        <NoteNode
          data={n.data}
          globals={globals}
          queries={queries}
          windowId={windowId}
        />
      );
    }
    if (n.type === "json_viewer") {
      return (
        <JsonViewerNode
          data={n.data}
          globals={globals}
          queries={queries}
        />
      );
    }
    if (n.type === "grid") {
      return (
        <GridNode
          node={n}
          globals={globals}
          queries={queries}
          windowId={windowId}
          errors={errors}
          debug={debug}
          renderNodes={(props) => (
            <RenderNodes
              {...props}
              errors={props.errors ?? errors}
              debug={props.debug ?? debug}
            />
          )}
        />
      );
    }
    if (n.type === "literal_code") {
      return (
        <LiteralCodeBlock
          code={typeof n.text === 'string' ? n.text : ''}
          lang={typeof n.data?.lang === 'string' ? n.data.lang : undefined}
        />
      );
    }
    return null;
  };

  const wrapNode = (n: Node, idx: number): ReactNode => {
    const content = renderNodeContent(n, idx);
    if (content === null || content === undefined) return null;
    const boundaryKey = n.id || idx;
    return (
      <NodeBoundary key={boundaryKey} node={n} windowId={windowId}>
        {content}
      </NodeBoundary>
    );
  };

  const content = nodes.map((n, i) => wrapNode(n, i));
  if (inline) return <>{content}</>;
  return <div className="flex flex-col gap-2">{content}</div>;
}
