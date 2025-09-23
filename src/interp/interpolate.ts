import { resolveReference } from './reference'
import { formatDateHelper } from '../lib/datetime'

export function interpolate(text: string, scope: { globals: any; queries: Record<string, any> }) {
  if (!text) return ''
  const ESC_OPEN = '\uE000'
  const ESC_CLOSE = '\uE001'
  const normalized = text
    .replace(/\\{{/g, ESC_OPEN)
    .replace(/\\}}/g, ESC_CLOSE)

  const interpolated = normalized.replace(/{{\s*(.+?)\s*}}/g, (_m, expr: string) => {
    const options = expr.split('||').map(part => part.trim()).filter(Boolean)
    for (const option of options.length ? options : ['']) {
      const value = resolveExpression(option, scope)
      if (value != null && value !== '') return String(value)
    }
    return ''
  })

  return interpolated
    .replace(new RegExp(ESC_OPEN, 'g'), '{{')
    .replace(new RegExp(ESC_CLOSE, 'g'), '}}')
}

function resolveExpression(option: string, scope: { globals: any; queries: Record<string, any> }): unknown {
  if (!option) return undefined
  const trimmed = option.trim()
  if (!trimmed) return undefined
  const { head, pipes } = parseMoustachePipeline(trimmed)
  const base = resolveBareExpression(head, scope)
  if (pipes.length === 0) return base
  return applyLocalPipes(base, pipes)
}

function resolveBareExpression(expr: string, scope: { globals: any; queries: Record<string, any> }): unknown {
  const resolved = resolveReference(expr, scope)
  if (resolved !== undefined && resolved !== null) return resolved
  if ((expr.startsWith('"') && expr.endsWith('"')) || (expr.startsWith("'") && expr.endsWith("'"))) {
    return expr.slice(1, -1)
  }
  if (/^-?\d+(\.\d+)?$/.test(expr)) return expr
  if (expr === 'true') return 'true'
  if (expr === 'false') return 'false'
  return undefined
}

function parseMoustachePipeline(expr: string): { head: string; pipes: string[] } {
  const parts = expr.split('|').map(part => part.trim()).filter(Boolean)
  if (parts.length <= 1) return { head: expr, pipes: [] }
  const [head, ...rest] = parts
  return { head, pipes: rest }
}

function applyLocalPipes(value: unknown, pipes: string[]): unknown {
  return pipes.reduce((acc, segment) => {
    if (acc == null) return acc
    const [name, rawArg] = segment.split(':', 2).map((s) => s.trim())
    switch (name) {
      case 'format_date':
        return formatDateHelper(acc, parseSimpleArg(rawArg))
      case 'uppercase':
        return typeof acc === 'string' ? acc.toUpperCase() : acc
      case 'trim':
        return typeof acc === 'string' ? acc.trim() : acc
      default:
        return acc
    }
  }, value)
}

function parseSimpleArg(arg?: string): any {
  if (!arg) return undefined
  if (arg === 'true') return true
  if (arg === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(arg)) return Number(arg)
  if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'"))) return arg.slice(1, -1)
  return arg
}
