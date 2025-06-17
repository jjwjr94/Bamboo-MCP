import type { SessionData } from '../types/auth.js';
import { logger } from '../utils/logger.js';

/**
 * Manages transient session state for the OAuth 2.0 authorization flow.
 * Implemented as a singleton to ensure a single state store across the application.
 * TODO: This in-memory implementation can be replaced with a distributed
 * store like Redis for production environments without changing the consumers.
 */
export class SessionManager {
  private static instance: SessionManager;
  private _sessionStore: Map<string, SessionData> = new Map();

  private constructor() {
    logger.info('SessionManager initialized');
  }

  public static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
      logger.info('Created SessionManager singleton instance');
    }
    return SessionManager.instance;
  }

  /**
   * Stores session data against a unique state key.
   * @param state The unique state identifier.
   * @param data The session data to store.
   */
  public storeSessionData(state: string, data: SessionData): void {
    if (!state) {
      throw new Error('Cannot store session data: state parameter is missing');
    }
    this._sessionStore.set(state, data);
    logger.debug('Session data stored', { state, mapSize: this._sessionStore.size });
  }

  /**
   * Retrieves session data using the state key.
   * @param state The unique state identifier.
   * @returns The stored session data, or undefined if not found.
   */
  public getSessionData(state: string): SessionData | undefined {
    const data = this._sessionStore.get(state);
    logger.debug('Session data retrieved', {
      state,
      found: !!data,
      mapSize: this._sessionStore.size,
    });
    return data;
  }

  /**
   * Deletes session data for a given state key after it has been used.
   * @param state The unique state identifier to clear.
   */
  public clearSessionData(state: string): void {
    this._sessionStore.delete(state);
    logger.debug('Session data cleared', { state });
  }
}
