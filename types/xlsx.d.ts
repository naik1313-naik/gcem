declare module "xlsx" {
  export interface WorkBook {
    SheetNames: string[];
    Sheets: Record<string, WorkSheet>;
  }
  export interface WorkSheet {
    [key: string]: any;
  }

  export function read(data: any, opts?: any): WorkBook;
  export namespace utils {
    function sheet_to_json(ws: WorkSheet, opts?: any): any[][];
  }
  export const version: string;
}
