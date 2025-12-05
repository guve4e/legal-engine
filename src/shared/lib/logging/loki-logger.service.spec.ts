import { LokiLoggerService } from './loki-logger.service';
import winston from 'winston';

// Mock winston and winston-loki
jest.mock('winston', () => ({
  createLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  }),
  transports: {
    Console: jest.fn(),
  },
  format: {
    combine: jest.fn((...args) => args),
    colorize: jest.fn(() => ({ mock: 'colorize' })),
    simple: jest.fn(() => ({ mock: 'simple' })),
    json: jest.fn(() => ({ mock: 'json' })),
  },
}));

jest.mock('winston-loki', () => {
  return jest.fn().mockImplementation(() => ({}));
});

describe('LokiLoggerService', () => {
  let loggerService: LokiLoggerService;
  const fixedTimestamp = '2025-01-25T16:58:54.519Z';

  const mockRequest = {
    method: 'POST',
    url: '/api/test',
    headers: {
      authorization: 'Bearer token',
      'content-type': 'application/json',
    },
    body: {
      email: 'user@example.com',
      password: 'secret',
    },
  };

  const expectedRedactedRequest = {
    method: 'POST',
    url: '/api/test',
    headers: {
      authorization: '*****',
      'content-type': 'application/json',
    },
    body: {
      email: 'user@example.com',
      password: '*****',
    },
  };

  const mockStack =
    'Error: Test error\n    at Object.<anonymous> (test.js:10:15)';
  const expectedLog = JSON.stringify({
    timestamp: fixedTimestamp,
    level: 'error',
    message: '❌ [ERROR] Test error message',
    stack: 'Error: Test error\n    (test.js:10:15)',
    request: expectedRedactedRequest,
  });

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(fixedTimestamp);
    loggerService = new LokiLoggerService('test-job', 'test-app');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should log an info message', () => {
    loggerService.log('Test info message');
    expect(loggerService['logger'].info).toHaveBeenCalledWith("ℹ️ [LOG] Test info message");
  });

  it('should log a warning message', () => {
    loggerService.warn('Test warning message');
    expect(loggerService['logger'].warn).toHaveBeenCalledWith("⚠️ [WARN] Test warning message");
  });

  it('should log a debug message', () => {
    loggerService.debug('Test debug message');
    expect(loggerService['logger'].debug).toHaveBeenCalledWith("🐛 [DEBUG] Test debug message");
  });

  it('should log an error message with a stack trace and redacted request', () => {
    loggerService.error('Test error message', mockStack, mockRequest);
    expect(loggerService['logger'].error).toHaveBeenCalledWith(expectedLog);
  });

  it('should clean stack traces by removing node_modules and limiting depth', () => {
    const rawStack = `
      Error: Test error
          at Object.<anonymous> (/Users/test/project/node_modules/some-package/index.js:10:15)
          at Object.<anonymous> (/Users/test/project/src/test.js:5:10)
          at Module._compile (internal/modules/cjs/loader.js:1158:30)
          at Object.Module._extensions..js (internal/modules/cjs/loader.js:1178:10)
          at Module.load (internal/modules/cjs/loader.js:1002:32)
    `;
    const cleanedStack = loggerService['cleanStackTrace'](rawStack);
    expect(cleanedStack).toBe(
      'Error: Test error\n    (some-package/index.js:10:15)\n    (project/src/test.js:5:10)'
    );
  });

  it('should redact sensitive headers and body fields', () => {
    const redactedRequest = loggerService['redactRequest'](mockRequest);
    expect(redactedRequest).toEqual(expectedRedactedRequest);
  });

  it('should add Console transport in development environment', () => {
    const mockConsoleTransport = jest.fn();
    winston.transports.Console = mockConsoleTransport as any;

    process.env['NODE_ENV'] = 'dev';

    new LokiLoggerService('test-job', 'test-app');

    expect(mockConsoleTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        format: expect.anything(),
      })
    );

    delete process.env['NODE_ENV'];
  });
});
