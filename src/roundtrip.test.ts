import { expect, test, describe } from "bun:test";
import { compileMarkdownDoc } from "./compiler";
import { defaultApps } from "./apps/app";
import { decompile } from "./decompiler";

function stripIds(ast: any): any {
  if (Array.isArray(ast)) return ast.map(stripIds)
  if (ast && typeof ast === 'object') {
    const out: any = {}
    for (const k of Object.keys(ast)) {
      if (k === 'id' || k === 'len') continue
      out[k] = stripIds((ast as any)[k])
    }
    return out
  }
  return ast
}

function normalizeMeta(obj: any): any {
  if (obj && typeof obj === 'object') {
    const out: any = Array.isArray(obj) ? [] : {}
    for (const k of Object.keys(obj).sort()) out[k] = normalizeMeta(obj[k])
    return out
  }
  return obj
}

describe("round-trip compile/decompile", () => {
  for (const [id, md] of Object.entries(defaultApps)) {
    test(`app ${id} round-trips`, () => {
      const c1 = compileMarkdownDoc(md)
      const md2 = decompile(c1)
      const c2 = compileMarkdownDoc(md2)
      expect(normalizeMeta(c2.meta)).toEqual(normalizeMeta(c1.meta))
      expect(stripIds(c2.ast)).toEqual(stripIds(c1.ast))
    })
  }
})
