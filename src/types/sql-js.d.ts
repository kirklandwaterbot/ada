declare module "sql.js" {
  export type SqlJsStatic = {
    Database: new (data?: BufferSource) => Database;
  };

  export type QueryExecResult = {
    columns: string[];
    values: unknown[][];
  };

  export type Database = {
    close: () => void;
    exec: (sql: string, params?: unknown[]) => QueryExecResult[];
  };

  export default function initSqlJs(config?: {
    locateFile?: (file: string) => string;
  }): Promise<SqlJsStatic>;
}
