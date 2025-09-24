import type { ReactNode } from "react";
import type { UiNode } from "../../compiler";

export type Node = UiNode;

export type RenderContext = {
  globals: any;
  windowId: string;
  queries: Record<string, any>;
  errors?: Record<string, string>;
  debug?: boolean;
};

export type RenderNodesProps = RenderContext & {
  nodes: Node[];
  inline?: boolean;
};

export type RenderNodesFn = (props: RenderNodesProps) => ReactNode;
