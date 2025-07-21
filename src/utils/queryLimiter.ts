import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import logger from './logger';

dotenv.config();

const TIME_PERIODS = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

type TimePeriod = 'hourly' | 'daily' | 'weekly' | 'monthly';

interface QueryRecord {
  userId: string;
  command: string;
  timestamp: number;
}

interface QueryLimits {
  global: {
    limit: number;
    period: TimePeriod;
  };
  commands: {
    [command: string]: {
      limit: number;
      period: TimePeriod;
    };
  };
}

class QueryLimiter {
  private queryRecords: QueryRecord[] = [];
  private limits: QueryLimits;
  private dataFile: string;
  private useFileStorage: boolean;
  private unlimitedUserIds: Set<string>;

  constructor() {
    try {
      this.limits = this.parseLimitsFromEnv();
      this.useFileStorage = process.env.QUERY_LIMITS_PERSIST === 'true';
      this.dataFile = path.join(__dirname, '../../data/query_records.json');
      this.unlimitedUserIds = this.parseUnlimitedUserIds();
      
      logger.info('QueryLimiter initialized', {
        fileStorage: this.useFileStorage,
        globalLimit: this.limits.global.limit,
        globalPeriod: this.limits.global.period,
        commandLimits: Object.keys(this.limits.commands).length,
        unlimitedUsers: this.unlimitedUserIds.size
      });
      
      if (this.useFileStorage) {
        this.ensureDataDirectory();
        this.loadQueryRecords();
        setInterval(() => this.cleanupOldRecords(), 60 * 60 * 1000);
        logger.debug('File storage enabled for query records', { dataFile: this.dataFile });
      }
    } catch (error) {
      logger.error('Failed to initialize QueryLimiter', error);
      throw error;
    }
  }

  private parseUnlimitedUserIds(): Set<string> {
    const userIdsString = process.env.UNLIMITED_QUERY_USERIDS || '';
    return new Set(userIdsString.split(',').map(id => id.trim()).filter(id => id !== ''));
  }

  private ensureDataDirectory() {
    try {
      const dataDir = path.dirname(this.dataFile);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        logger.info('Created data directory for query records', { dataDir });
      }
    } catch (error) {
      logger.error('Failed to create data directory', error, { dataFile: this.dataFile });
      throw error;
    }
  }

  private loadQueryRecords() {
    try {
      if (fs.existsSync(this.dataFile)) {
        const data = fs.readFileSync(this.dataFile, 'utf8');
        this.queryRecords = JSON.parse(data);
        logger.info('Loaded query records from file', { 
          recordCount: this.queryRecords.length,
          dataFile: this.dataFile 
        });
      } else {
        logger.debug('No existing query records file found, starting fresh');
        this.queryRecords = [];
      }
    } catch (error) {
      logger.error('Error loading query records, starting with empty records', error, { dataFile: this.dataFile });
      this.queryRecords = [];
    }
  }

  private saveQueryRecords() {
    if (!this.useFileStorage) return;
    
    try {
      fs.writeFileSync(this.dataFile, JSON.stringify(this.queryRecords), 'utf8');
      logger.debug('Saved query records to file', { 
        recordCount: this.queryRecords.length 
      });
    } catch (error) {
      logger.error('Error saving query records', error, { 
        dataFile: this.dataFile,
        recordCount: this.queryRecords.length 
      });
    }
  }

  private parseLimitsFromEnv(): QueryLimits {
    const limits: QueryLimits = {
      global: {
        limit: parseInt(process.env.QUERY_LIMIT_GLOBAL ?? '-1'),
        period: (process.env.QUERY_LIMIT_GLOBAL_PERIOD ?? 'daily') as TimePeriod,
      },
      commands: {},
    };

    const commandNames = ['fastgpt', 'websearch', 'newssearch', 'summarize', 'search'];
    
    for (const cmd of commandNames) {
      const limitEnv = process.env[`QUERY_LIMIT_${cmd.toUpperCase()}`];
      const periodEnv = process.env[`QUERY_LIMIT_${cmd.toUpperCase()}_PERIOD`];
      
      if (limitEnv) {
        limits.commands[cmd] = {
          limit: parseInt(limitEnv),
          period: (periodEnv ?? 'daily') as TimePeriod,
        };
      }
    }

    return limits;
  }

  private cleanupOldRecords() {
    const now = Date.now();
    const oldestToKeep = now - TIME_PERIODS.monthly;
    const originalCount = this.queryRecords.length;
    
    this.queryRecords = this.queryRecords.filter(record => record.timestamp >= oldestToKeep);
    
    const cleanedCount = originalCount - this.queryRecords.length;
    if (cleanedCount > 0) {
      logger.info('Cleaned up old query records', { 
        removedRecords: cleanedCount,
        remainingRecords: this.queryRecords.length
      });
    }
    
    this.saveQueryRecords();
  }

  private getRecordsInPeriod(userId: string, command: string | null, period: TimePeriod): QueryRecord[] {
    const now = Date.now();
    const periodMs = TIME_PERIODS[period];
    const since = now - periodMs;
    
    return this.queryRecords.filter(record => 
      record.userId === userId && 
      record.timestamp >= since && 
      (command === null || record.command === command)
    );
  }

  public canMakeQuery(userId: string, command: string): boolean {
    try {
      if (this.unlimitedUserIds.has(userId)) {
        logger.debug('User has unlimited queries', { userId, command });
        return true;
      }
      
      // Check command-specific limit
      const cmdLimit = this.limits.commands[command];
      if (cmdLimit && cmdLimit.limit !== -1) {
        const cmdRecords = this.getRecordsInPeriod(userId, command, cmdLimit.period);
        if (cmdRecords.length >= cmdLimit.limit) {
          logger.queryLimitHit(userId, command, 'command');
          return false;
        }
      }
      
      // Check global limit
      if (this.limits.global.limit !== -1) {
        const globalRecords = this.getRecordsInPeriod(userId, null, this.limits.global.period);
        if (globalRecords.length >= this.limits.global.limit) {
          logger.queryLimitHit(userId, command, 'global');
          return false;
        }
      }
      
      return true;
    } catch (error) {
      logger.error('Error checking query limits, allowing query', error, { userId, command });
      return true; // Fail open - don't block users due to limiter errors
    }
  }

  public recordQuery(userId: string, command: string): void {
    try {
      if (this.unlimitedUserIds.has(userId)) {
        return;
      }
      
      const record: QueryRecord = {
        userId,
        command,
        timestamp: Date.now(),
      };
      
      this.queryRecords.push(record);
      logger.queryRecorded(userId, command);
      this.saveQueryRecords();
    } catch (error) {
      logger.error('Error recording query', error, { userId, command });
    }
  }

  public getRemainingQueries(userId: string, command: string): { command: number, global: number } {
    if (this.unlimitedUserIds.has(userId)) {
      return {
        command: -1,
        global: -1
      };
    }
    
    let commandRemaining = -1;
    let globalRemaining = -1;
    
    const cmdLimit = this.limits.commands[command];
    if (cmdLimit && cmdLimit.limit !== -1) {
      const cmdRecords = this.getRecordsInPeriod(userId, command, cmdLimit.period);
      commandRemaining = cmdLimit.limit - cmdRecords.length;
    }
    
    if (this.limits.global.limit !== -1) {
      const globalRecords = this.getRecordsInPeriod(userId, null, this.limits.global.period);
      globalRemaining = this.limits.global.limit - globalRecords.length;
    }
    
    return {
      command: commandRemaining,
      global: globalRemaining,
    };
  }

  public getCommandLimitInfo(command: string): { limit: number, period: string } | null {
    const cmdLimit = this.limits.commands[command];
    if (!cmdLimit || cmdLimit.limit === -1) {
      return null;
    }
    
    return {
      limit: cmdLimit.limit,
      period: cmdLimit.period,
    };
  }

  public getGlobalLimitInfo(): { limit: number, period: string } | null {
    if (this.limits.global.limit === -1) {
      return null;
    }
    
    return {
      limit: this.limits.global.limit,
      period: this.limits.global.period,
    };
  }
  
  public isUnlimitedUser(userId: string): boolean {
    return this.unlimitedUserIds.has(userId);
  }
}

const queryLimiter = new QueryLimiter();
export default queryLimiter; 