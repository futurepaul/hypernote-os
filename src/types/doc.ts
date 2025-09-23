import { z } from "zod";

const unknownRecord = z.record(z.string(), z.unknown());

export const NodeDepsSchema = z
  .object({
    queries: z.array(z.string()).optional(),
    globals: z.array(z.string()).optional(),
  })
  .optional();

const BaseNodeSchema = z.object({
  id: z.string(),
  type: z.union([
    z.literal("markdown"),
    z.literal("button"),
    z.literal("input"),
    z.literal("hstack"),
    z.literal("vstack"),
    z.literal("each"),
    z.literal("markdown_editor"),
    z.literal("literal_code"),
    z.literal("markdown_viewer"),
    z.literal("note"),
  ]),
  deps: NodeDepsSchema,
});

const MarkdownNodeSchema = BaseNodeSchema.extend({
  type: z.literal("markdown"),
  markdown: z.unknown().optional(),
  text: z.string().optional(),
  refs: z.array(z.string()).optional(),
});

const ActionableNodeSchema = BaseNodeSchema.extend({
  type: z.union([z.literal("button"), z.literal("input"), z.literal("markdown_editor")]),
  data: unknownRecord.optional(),
});

const LiteralCodeNodeSchema = BaseNodeSchema.extend({
  type: z.literal("literal_code"),
  text: z.string().optional(),
  data: unknownRecord.optional(),
});

const MarkdownViewerNodeSchema = BaseNodeSchema.extend({
  type: z.literal("markdown_viewer"),
  data: unknownRecord.optional(),
});

const NoteNodeSchema = BaseNodeSchema.extend({
  type: z.literal("note"),
  data: unknownRecord.optional(),
});

const StackNodeSchema = BaseNodeSchema.extend({
  type: z.union([z.literal("hstack"), z.literal("vstack")]),
  data: unknownRecord.optional(),
  children: z.lazy(() => UiNodeSchema.array()).default([]),
});

const EachNodeSchema = BaseNodeSchema.extend({
  type: z.literal("each"),
  data: z
    .object({
      source: z.string(),
      as: z.string(),
    })
    .passthrough(),
  children: z.lazy(() => UiNodeSchema.array()).default([]),
});

export const UiNodeSchema = z.union([
  MarkdownNodeSchema,
  ActionableNodeSchema,
  StackNodeSchema,
  EachNodeSchema,
  LiteralCodeNodeSchema,
  MarkdownViewerNodeSchema,
  NoteNodeSchema,
]);

export type UiNode = z.infer<typeof UiNodeSchema>;

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
