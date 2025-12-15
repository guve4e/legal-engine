import winston, { createLogger, transports } from 'winston';
import LokiTransport from 'winston-loki';
import {Inject, Injectable, Logger} from '@nestjs/common';
import { LoggerService, RedactedRequest } from '../../types';


@Injectable()
export class LokiLoggerService implements LoggerService {
  private readonly logger;

  public constructor(
    @Inject('JOB_NAME') private readonly job: string,
    @Inject('APP_NAME') private readonly appName: string,
   ) {
    this.job = job;
    this.logger = this.createLogger(job, appName);
  }

  public get app(): string {
    return this.appName;
  }

  public async log(message: string): Promise<void> {
    return new Promise<void>((resolve) => {
      this.logger.info(`ℹ️ [LOG] ${message}`);
      resolve();
    });
  }

  public async warn(message: string): Promise<void> {
    return new Promise<void>((resolve) => {
      this.logger.warn(`⚠️ [WARN] ${message}`);
      resolve();
    });
  }

  public async debug(message: string): Promise<void> {
    return new Promise<void>((resolve) => {
      if (process.env['NODE_ENV'] !== 'production')
        this.logger.debug(`🐛 [DEBUG] ${message}`);

      resolve();
    });
  }

  public async error(
    message: string,
    stack?: string,
    request?: RedactedRequest
  ): Promise<void> {
    const logObject = {
      timestamp: new Date().toISOString(),
      level: 'error',
      message: `❌ [ERROR] ${message}`,
      stack: stack ? this.cleanStackTrace(stack) : undefined,
      request: request ? this.redactRequest(request) : undefined,
    };

    try {
      await this.logger.error(JSON.stringify(logObject));
    } catch (err) {
      Logger.log('Failed to log error:', err);
      throw err;
    }
  }

  private createLogger(job: string, app: string): winston.Logger {
    const transportsArray = this.initializeTransports(job, app);

    return createLogger({
      level: 'debug',
      format: winston.format.json(),
      transports: transportsArray,
    });
  }

  private initializeTransports(job: string, app: string): winston.transport[] {
    const transportsArray: winston.transport[] = [
      this.createLokiTransport(job, app),
    ];

    if (this.isDevelopmentEnvironment()) {
      transportsArray.push(this.createConsoleTransport());
    }

    return transportsArray;
  }

  private createLokiTransport(job: string, app: string): LokiTransport {
    return new LokiTransport({
      host: 'https://pl-loki.ddns.net',
      labels: { job, app },
      json: true,
      format: winston.format.json(),
      replaceTimestamp: true,
      onConnectionError: (err: Error) =>
        console.error('Loki connection error:', err),
    });
  }

  private createConsoleTransport(): winston.transport {
    return new transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    });
  }

  private isDevelopmentEnvironment(): boolean {
    return ['dev', 'development'].includes(process.env['NODE_ENV'] || '');
  }

  private cleanStackTrace(stack: string, maxDepth: number = 4): string {
    if (!stack) return '';

    const stackLines = stack
      .trim()
      .split('\n')
      .map((line) => line.trim())
      .filter(
        (line) =>
          line.startsWith('Error:') || !line.includes('internal/modules')
      )
      .map((line) => {
        if (line.startsWith('at')) {
          const match = line.match(/\((.+)\)/);
          if (match) {
            const path = match[1];
            const simplifiedPath = path.includes('node_modules')
              ? path.split('node_modules/').pop()!
              : path.split('/').slice(-3).join('/');
            return `(${simplifiedPath})`;
          }
        }
        return line;
      });

    return stackLines.slice(0, maxDepth).join('\n    ');
  }

  private redactRequest(request: RedactedRequest) {
    return {
      method: request.method,
      url: request.url,
      headers: this.redactHeaders(request.headers),
      body: this.redactBody(request.body),
    };
  }

  private redactHeaders(headers: Record<string, string>) {
    const sensitive = ['authorization', 'cookie'];
    return Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [
        k,
        sensitive.includes(k.toLowerCase()) ? '*****' : v,
      ])
    );
  }

  private redactBody(body: Record<string, any> | undefined | null) {
    const sensitive = ['password', 'token', 'creditcard'];
    if (!body || typeof body !== 'object') return {};

    return Object.fromEntries(
      Object.entries(body).map(([k, v]) => [
        k,
        sensitive.includes(k.toLowerCase()) ? '*****' : v,
      ])
    );
  }
}
