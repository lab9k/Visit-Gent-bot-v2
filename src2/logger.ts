export interface ILogger {
  error(data: any, ...args: any): void;
  log(data: any, ...args: any): void;
  warn(data: any, ...args: any): void;
}
