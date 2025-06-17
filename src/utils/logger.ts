// Structured logger utility
// All logs go to stderr to avoid MCP protocol interference

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: any;
}

class Logger {
  private minLevel: LogLevel;

  constructor(minLevel: LogLevel = 'info') {
    this.minLevel = minLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };
    return levels[level] >= levels[this.minLevel];
  }

  private log(level: LogLevel, message: string, meta: Record<string, any> = {}): void {
    if (!this.shouldLog(level)) return;

    const logEntry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...meta,
    };

    // Send to stderr to avoid protocol interference
    console.error(JSON.stringify(logEntry));
  }

  debug(message: string, meta?: Record<string, any>): void {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: Record<string, any>): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: Record<string, any>): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: Record<string, any>): void {
    this.log('error', message, meta);
  }

  // Helper methods for common logging patterns
  authAttempt(userId: string, success: boolean, ip: string, userAgent?: string): void {
    this.info('AUTH_ATTEMPT', {
      userId,
      success,
      ip,
      userAgent,
    });
  }

  tokenUsage(userId: string, tool: string, success: boolean): void {
    this.info('TOKEN_USAGE', {
      userId,
      tool,
      success,
    });
  }

  suspiciousActivity(event: string, details: Record<string, any>): void {
    this.warn('SUSPICIOUS_ACTIVITY', {
      event,
      ...details,
    });
  }

  mcpRequest(method: string, toolName?: string, success?: boolean, duration?: number): void {
    this.info('MCP_REQUEST', {
      method,
      toolName,
      success,
      duration,
    });
  }

  dbOperation(operation: string, table?: string, success?: boolean, duration?: number): void {
    this.debug('DB_OPERATION', {
      operation,
      table,
      success,
      duration,
    });
  }
}

// Export singleton instance
export const logger = new Logger(process.env.NODE_ENV === 'development' ? 'debug' : 'info');

// Export class for custom instances
export { Logger };
