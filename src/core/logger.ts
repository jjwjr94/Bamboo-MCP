export class Logger {
  private context: string;

  constructor(context: string = 'App') {
    this.context = context;
  }

  private formatMessage(level: string, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.length > 0 ? ' ' + args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ') : '';
    
    return `[${timestamp}] [${level.toUpperCase()}] [${this.context}] ${message}${formattedArgs}`;
  }

  public info(message: string, ...args: any[]): void {
    console.log(this.formatMessage('info', message, ...args));
  }

  public warn(message: string, ...args: any[]): void {
    console.warn(this.formatMessage('warn', message, ...args));
  }

  public error(message: string, ...args: any[]): void {
    console.error(this.formatMessage('error', message, ...args));
  }

  public debug(message: string, ...args: any[]): void {
    if (process.env.LOG_LEVEL === 'debug') {
      console.debug(this.formatMessage('debug', message, ...args));
    }
  }

  public createChild(childContext: string): Logger {
    return new Logger(`${this.context}:${childContext}`);
  }
}

