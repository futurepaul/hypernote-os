import { resolveDollar, resolveDollarPath } from './resolveDollar'

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

export function resolveImgDollarSrc(html: string, queries: Record<string, any>) {
  return html.replace(/<img\b([^>]*?)src=["']([^"']+)["']([^>]*)>/g, (m, pre, src, post) => {
    if (typeof src === 'string' && src.startsWith('$')) {
      const [qidRaw, ...rest] = src.split('.')
      const qid = String(qidRaw)
      const base = queries[qid]
      let val: any = base
      if (rest.length) val = getPath(base, rest.join('.'))
      if (val != null) {
        const u = String(val).replace(/"/g, '&quot;')
        return `<img${pre}src="${u}"${post}>`
      }
    }
    return m
  })
}

function getPath(obj: any, path: string): any {
  if (!path) return undefined
  return path.split('.').reduce((acc, k) => (acc && typeof acc === 'object' ? acc[k] : undefined), obj)
}

function resolveExpression(option: string, scope: { globals: any; queries: Record<string, any> }): unknown {
  if (!option) return undefined
  const trimmed = option.trim()
  if (!trimmed) return undefined
  if (trimmed.startsWith('$')) {
    const resolved = resolveDollar(trimmed, scope.queries)
    if (resolved) {
      return resolved.suffix ? `${resolved.value}${resolved.suffix}` : resolved.value
    }
    return resolveDollarFromGlobals(trimmed, scope.globals)
  }
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed
  if (trimmed === 'true') return 'true'
  if (trimmed === 'false') return 'false'
  return undefined
}

function resolveDollarFromGlobals(token: string, globals: any): unknown {
  const match = token.match(/^(\$[A-Za-z0-9_.-]+)(.*)$/);
  if (!match) return undefined;
  const path = match[1].slice(1);
  const suffix = match[2] || '';
  const base = getPath(globals, path);
  if (base == null) return undefined;
  const value = String(base);
  return suffix ? `${value}${suffix}` : value;
}
