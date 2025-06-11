declare module 'better-sqlite3' {
  interface Database {
    prepare(sql: string): Statement;
    transaction<T>(fn: (...args: any[]) => void): (...args: any[]) => void;
    exec(sql: string): void;
    pragma(pragma: string, options?: { simple?: boolean }): any;
    close(): void;
  }

  interface Statement {
    run(...params: any[]): { lastInsertRowid: number; changes: number };
    get(...params: any[]): any;
    all(...params: any[]): any[];
    iterate(...params: any[]): Iterator<any>;
  }

  interface DatabaseConstructor {
    new (filename: string, options?: { readonly?: boolean; fileMustExist?: boolean; timeout?: number }): Database;
    (filename: string, options?: { readonly?: boolean; fileMustExist?: boolean; timeout?: number }): Database;
  }

  const Database: DatabaseConstructor;
  export default Database;
} 