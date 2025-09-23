import YAML from 'yaml'
import { toText as markdownToText } from 'very-small-parser/lib/markdown/block/toText'
import type { CompiledDoc, UiNode } from './compiler'
import { sanitizeStackConfig } from './lib/layout'

function sortObject<T extends Record<string, any>>(obj: T): T {
  const out: any = Array.isArray(obj) ? [] : {}
  const keys = Object.keys(obj).sort()
  for (const k of keys) {
    const v = (obj as any)[k]
    if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = sortObject(v)
    else out[k] = v
  }
  return out as T
}

function encodeFrontmatter(meta: Record<string, any>): string {
  const {
    hypernote = {},
    queries = {},
    actions = {},
    components = {},
    events = {},
    ...rest
  } = meta || {}

  const sorted: Record<string, any> = {}
  if (Object.keys(hypernote).length) sorted.hypernote = sortObject(hypernote)
  if (Object.keys(queries).length) sorted.queries = sortObject(queries)
  if (Object.keys(actions).length) sorted.actions = sortObject(actions)
  if (Object.keys(components).length) sorted.components = sortObject(components)
  if (Object.keys(events).length) sorted.events = sortObject(events)
  for (const [key, value] of Object.entries(rest)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) sorted[key] = sortObject(value)
    else sorted[key] = value
  }

  let y = YAML.stringify(sorted)
  if (!y.endsWith('\n')) y += '\n'
  return `---\n${y}---\n`
}

function encodeNode(n: UiNode): string {
  if (n.type === 'markdown') {
    const nodes = n.markdown as any
    const text = markdownToText(nodes || [])
    return text.trim()
  }
  if (n.type === 'button' || n.type === 'input' || n.type === 'markdown_editor') {
    const y = YAML.stringify(n.data || {}).trimEnd()
    const lang = n.type === 'markdown_editor' ? 'markdown-editor' : n.type
    return `\n\`\`\`${lang}\n${y}\n\`\`\`\n`
  }
  if ((n as any).type === 'literal_code') {
    const lang = typeof (n as any).data?.lang === 'string' ? (n as any).data.lang : ''
    const fence = lang ? `\n\`\`\`${lang}\n` : `\n\`\`\`\n`
    const body = (n as any).text ?? ''
    return `${fence}${body}\n\`\`\`\n`
  }
  if (n.type === 'hstack' || n.type === 'vstack') {
    const kind = n.type
    const config = sanitizeStackConfig(n.data)
    const configYaml = config ? `${YAML.stringify(config).trimEnd()}\n` : ''
    const start = `\n\`\`\`${kind}.start\n${configYaml}\`\`\`\n`
    const body = (n.children || []).map(encodeNode).join('\n')
    const end = `\n\`\`\`${kind}.end\n\`\`\`\n`
    return `${start}${body}${end}`
  }
  if (n.type === 'each') {
    const data = n.data || {}
    const payload: Record<string, any> = {
      from: String(data.source || '$items'),
    }
    if (data.as) payload.as = data.as
    const y = YAML.stringify(payload).trimEnd()
    const start = `\n\`\`\`each.start\n${y}\n\`\`\`\n`
    const body = (n.children || []).map(encodeNode).join('\n')
    const end = `\n\`\`\`each.end\n\`\`\`\n`
    return `${start}${body}${end}`
  }
  return ''
}

export function decompile(doc: CompiledDoc): string {
  const front = encodeFrontmatter(doc.meta || {})
  const body = (doc.ast || []).map(encodeNode).join('\n\n')
  return `${front}\n${body}\n`
}

export default decompile
