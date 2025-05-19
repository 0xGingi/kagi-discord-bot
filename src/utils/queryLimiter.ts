import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

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

  constructor() {
    this.limits = this.parseLimitsFromEnv();
    this.useFileStorage = process.env.QUERY_LIMITS_PERSIST === 'true';
    this.dataFile = path.join(__dirname, '../../data/query_records.json');
    
    if (this.useFileStorage) {
      this.ensureDataDirectory();
      this.loadQueryRecords();
      setInterval(() => this.cleanupOldRecords(), 60 * 60 * 1000);
    }
  }

  private ensureDataDirectory() {
    const dataDir = path.dirname(this.dataFile);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  private loadQueryRecords() {
    try {
      if (fs.existsSync(this.dataFile)) {
        const data = fs.readFileSync(this.dataFile, 'utf8');
        this.queryRecords = JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading query records:', error);
      this.queryRecords = [];
    }
  }

  private saveQueryRecords() {
    if (!this.useFileStorage) return;
    
    try {
      fs.writeFileSync(this.dataFile, JSON.stringify(this.queryRecords), 'utf8');
    } catch (error) {
      console.error('Error saving query records:', error);
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
    this.queryRecords = this.queryRecords.filter(record => record.timestamp >= oldestToKeep);
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
    const cmdLimit = this.limits.commands[command];
    if (cmdLimit && cmdLimit.limit !== -1) {
      const cmdRecords = this.getRecordsInPeriod(userId, command, cmdLimit.period);
      if (cmdRecords.length >= cmdLimit.limit) {
        return false;
      }
    }
    
    if (this.limits.global.limit !== -1) {
      const globalRecords = this.getRecordsInPeriod(userId, null, this.limits.global.period);
      if (globalRecords.length >= this.limits.global.limit) {
        return false;
      }
    }
    
    return true;
  }

  public recordQuery(userId: string, command: string): void {
    const record: QueryRecord = {
      userId,
      command,
      timestamp: Date.now(),
    };
    
    this.queryRecords.push(record);
    this.saveQueryRecords();
  }

  public getRemainingQueries(userId: string, command: string): { command: number, global: number } {
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
}

const queryLimiter = new QueryLimiter();
export default queryLimiter; 