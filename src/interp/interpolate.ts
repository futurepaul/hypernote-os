import { resolveReference } from './reference'

export function interpolate(text: string, scope: { globals: any; queries: Record<string, any> }) {
  if (!text) return ''
  return text.replace(/{{\s*(.+?)\s*}}/g, (_m, expr: string) => {
    const options = expr.split('||').map(part => part.trim()).filter(Boolean)
    for (const option of options.length ? options : ['']) {
      const value = resolveExpression(option, scope)
      if (value != null && value !== '') return String(value)
    }
    return ''
  })
}

function resolveExpression(option: string, scope: { globals: any; queries: Record<string, any> }): unknown {
  if (!option) return undefined
  const trimmed = option.trim()
  if (!trimmed) return undefined
  const resolved = resolveReference(trimmed, scope)
  if (resolved !== undefined && resolved !== null) return resolved
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed
  if (trimmed === 'true') return 'true'
  if (trimmed === 'false') return 'false'
  return undefined
}
