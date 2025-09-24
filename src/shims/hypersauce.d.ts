declare module 'hypersauce' {
  export class HypersauceClient {
    constructor(options?: any)
  }

  export class PipeEngine {
    constructor(registry?: Map<string, any>)
    execute(data: unknown, operations: any[]): unknown
    validateOperations(operations: any[]): void
  }

  export function toPipeOps(yamlPipe?: unknown[]): any[]
}
