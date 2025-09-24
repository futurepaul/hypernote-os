import { z, type ZodType } from "zod";

const unknownRecord = z.record(z.string(), z.unknown());

export type NodeDeps = {
  queries?: string[];
  globals?: string[];
};

export const NodeDepsSchema = z
  .object({
    queries: z.array(z.string()).optional(),
    globals: z.array(z.string()).optional(),
  })
  .optional();

export type UiNode = {
  id: string;
  type: string;
  deps?: NodeDeps;
  data?: Record<string, unknown>;
  text?: string;
  markdown?: unknown;
  refs?: string[];
  children?: UiNode[];
  [key: string]: unknown;
};

export const UiNodeSchema: ZodType<UiNode> = z.lazy(() =>
  z
    .object({
      id: z.string(),
      type: z.string(),
      deps: NodeDepsSchema,
      data: z.record(z.string(), z.unknown()).optional(),
      text: z.string().optional(),
      markdown: z.unknown().optional(),
      refs: z.array(z.string()).optional(),
      children: z.array(z.lazy(() => UiNodeSchema)).optional(),
    })
    .catchall(z.unknown()),
);

const HypernoteSectionSchema = z
  .object({
    name: z.string().optional(),
    icon: z.string().optional(),
    description: z.string().optional(),
    version: z.string().optional(),
    author: z.string().optional(),
    type: z.string().optional(),
  })
  .catchall(z.unknown());

const QueryDefinitionSchema = unknownRecord;
const ActionDefinitionSchema = z.unknown();

const DependencySchema = z
  .object({
    globals: z.array(z.string()).optional(),
    queries: z.array(z.string()).optional(),
  })
  .optional();

export const HypernoteMetaSchema = z
  .object({
    hypernote: HypernoteSectionSchema.optional(),
    queries: z.record(z.string(), QueryDefinitionSchema).optional(),
    actions: z.record(z.string(), ActionDefinitionSchema).optional(),
    forms: z.record(z.string(), z.unknown()).optional(),
    state: z.record(z.string(), z.unknown()).optional(),
    components: z.record(z.string(), z.unknown()).optional(),
    events: z.record(z.string(), z.unknown()).optional(),
    dependencies: DependencySchema,
  })
  .catchall(z.unknown());

export const DocSchema = z.object({
  version: z.string().optional(),
  meta: HypernoteMetaSchema,
  ast: z.array(UiNodeSchema),
});

export type DocIR = z.infer<typeof DocSchema>;

export function validateDoc(doc: unknown): DocIR {
  return DocSchema.parse(doc);
}
