declare module 'sql.js' {
  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number>) => Database
  }
  interface Database {
    run(sql: string, params?: any[]): void
    prepare(sql: string): Statement
    export(): Uint8Array
    close(): void
  }
  interface Statement {
    bind(params?: any[]): void
    step(): boolean
    getAsObject(): any
    free(): void
  }
  function initSqlJs(options?: { locateFile?: (file: string) => string }): Promise<SqlJsStatic>
  export default initSqlJs
  export type { Database, SqlJsStatic, Statement }
}
