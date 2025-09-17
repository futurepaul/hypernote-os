import { getDefaultStore } from 'jotai'

function getPath(obj: any, path: string): any {
  return path.split('.').reduce((acc, k) => (acc && typeof acc === 'object' ? acc[k] : undefined), obj)
}

export function interpolate(text: string, scope: { globals: any; queries: Record<string, any> }) {
  if (!text) return ''
  return text.replace(/{{\s*([$]?[a-zA-Z0-9_\.-]+)\s*}}/g, (_m, key: string) => {
    if (key === 'time.now') return String(scope.globals?.time?.now ?? Math.floor(Date.now() / 1000))
    if (key.startsWith('$')) {
      const [qid, ...rest] = key.split('.')
      const base = scope.queries[qid]
      if (base == null) return ''
      if (!rest.length) return String(base ?? '')
      const v = getPath(base, rest.join('.'))
      return v == null ? '' : String(v)
    }
    const val = getPath(scope.globals, key)
    return val == null ? '' : String(val)
  })
}

export function resolveImgDollarSrc(html: string, queries: Record<string, any>) {
  return html.replace(/<img\b([^>]*?)src=["']([^"']+)["']([^>]*)>/g, (m, pre, src, post) => {
    if (typeof src === 'string' && src.startsWith('$')) {
      const [qid, ...rest] = src.split('.')
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

