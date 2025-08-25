declare module 'passport-facebook-token' {
  import { Strategy } from 'passport';
  
  interface FacebookTokenStrategyOptions {
    clientID: string;
    clientSecret: string;
    passReqToCallback?: boolean;
  }
  
  interface FacebookTokenStrategyVerifyFunction {
    (accessToken: string, refreshToken: string, profile: any, done: (error: any, user?: any) => void): void;
  }
  
  interface FacebookTokenStrategyVerifyFunctionWithRequest {
    (req: any, accessToken: string, refreshToken: string, profile: any, done: (error: any, user?: any) => void): void;
  }
  
  class FacebookTokenStrategy extends Strategy {
    constructor(options: FacebookTokenStrategyOptions, verify: FacebookTokenStrategyVerifyFunction);
    constructor(options: FacebookTokenStrategyOptions & { passReqToCallback: true }, verify: FacebookTokenStrategyVerifyFunctionWithRequest);
  }
  
  export = FacebookTokenStrategy;
}
