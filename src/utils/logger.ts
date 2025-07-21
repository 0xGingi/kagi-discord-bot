import dotenv from 'dotenv';

dotenv.config();

enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

class Logger {
  private logLevel: LogLevel;

  constructor() {
    const level = process.env.LOG_LEVEL?.toUpperCase() || 'INFO';
    this.logLevel = LogLevel[level as keyof typeof LogLevel] ?? LogLevel.INFO;
  }

  private formatMessage(level: string, message: string, metadata?: any): string {
    const timestamp = new Date().toISOString();
    const metadataStr = metadata ? ` | ${JSON.stringify(metadata)}` : '';
    return `[${timestamp}] [${level}] ${message}${metadataStr}`;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel;
  }

  debug(message: string, metadata?: any): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(this.formatMessage('DEBUG', message, metadata));
    }
  }

  info(message: string, metadata?: any): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(this.formatMessage('INFO', message, metadata));
    }
  }

  warn(message: string, metadata?: any): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage('WARN', message, metadata));
    }
  }

  error(message: string, error?: Error | any, metadata?: any): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const errorData = error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error;
      
      const combinedMetadata = { ...metadata, error: errorData };
      console.error(this.formatMessage('ERROR', message, combinedMetadata));
    }
  }

  // Command-specific logging methods
  commandStart(commandName: string, userId: string, guildId?: string, metadata?: any): void {
    this.info(`Command ${commandName} started`, {
      command: commandName,
      userId,
      guildId,
      ...metadata
    });
  }

  commandSuccess(commandName: string, userId: string, duration: number, metadata?: any): void {
    this.info(`Command ${commandName} completed successfully`, {
      command: commandName,
      userId,
      duration: `${duration}ms`,
      ...metadata
    });
  }

  commandError(commandName: string, userId: string, error: Error | any, metadata?: any): void {
    this.error(`Command ${commandName} failed`, error, {
      command: commandName,
      userId,
      ...metadata
    });
  }

  // API-specific logging methods
  apiRequest(endpoint: string, method: string, params?: any): void {
    this.debug(`API Request to ${endpoint}`, {
      endpoint,
      method,
      params: params ? JSON.stringify(params) : undefined
    });
  }

  apiResponse(endpoint: string, duration: number, status?: number, metadata?: any): void {
    this.debug(`API Response from ${endpoint}`, {
      endpoint,
      duration: `${duration}ms`,
      status,
      ...metadata
    });
  }

  apiError(endpoint: string, error: Error | any, metadata?: any): void {
    this.error(`API Error for ${endpoint}`, error, {
      endpoint,
      ...metadata
    });
  }

  // Query limiter logging
  queryLimitHit(userId: string, command: string, limitType: 'command' | 'global'): void {
    this.warn(`Query limit hit for user ${userId}`, {
      userId,
      command,
      limitType
    });
  }

  queryRecorded(userId: string, command: string): void {
    this.debug(`Query recorded for user ${userId}`, {
      userId,
      command
    });
  }
}

const logger = new Logger();
export default logger;