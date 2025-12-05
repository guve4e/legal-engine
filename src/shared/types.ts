export type RedactedRequest = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: Record<string, any>;
};

export interface LoggerService {
  app: string;
  error(message: string, stack?: string, request?: RedactedRequest): Promise<void>;
  log(message: string): Promise<void>;
  warn(message: string): Promise<void>;
  debug(message: string): Promise<void>;
}

