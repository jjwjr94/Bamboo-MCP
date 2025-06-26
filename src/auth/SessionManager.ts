import { eq, lt } from 'drizzle-orm';
import type { DatabaseTransaction } from '../db/client.js';
import { db } from '../db/client.js';
import { withUserContext } from '../db/client.js';
import { oauthSessions, oauthTempAuthCodes } from '../db/schema.js';
import type { SessionData, TempAuthCodeData } from '../types/auth.js';
import { DatabaseError, ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Manages transient session state for the OAuth 2.0 authorization flow
 * by storing state in the database. This implementation is stateless.
 */
export class SessionManager {
  /**
   * Stores session data against a unique state key in the database.
   * @param state The unique state identifier.
   * @param data The session data to store.
   */
  public async storeSessionData(state: string, data: SessionData): Promise<void> {
    if (!state) {
      throw new ValidationError('Cannot store session data: state parameter is missing');
    }

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    try {
      await db.insert(oauthSessions).values({
        state,
        sessionData: data,
        expiresAt,
      });
      logger.debug('Session data stored in database', { state });
    } catch (error) {
      logger.error('Failed to store session data in database', { state, error });
      throw new DatabaseError('Could not store OAuth session state.');
    }
  }

  /**
   * Stores temporary authorization code data against a unique code key in the database.
   * Used for horizontal scaling of OAuth flows.
   * @param authCode The unique authorization code identifier.
   * @param data The temporary auth code data to store.
   */
  public async storeTempAuthCode(authCode: string, data: TempAuthCodeData): Promise<void> {
    if (!authCode) {
      throw new ValidationError('Cannot store temp auth code: code parameter is missing');
    }

    const expiresAt = new Date(data.expires);

    try {
      await db.insert(oauthTempAuthCodes).values({
        code: authCode,
        data: data,
        expiresAt,
      });
      logger.debug('Temp auth code stored in database', { authCode });
    } catch (error) {
      logger.error('Failed to store temp auth code in database', { authCode, error });
      throw new DatabaseError('Could not store temporary authorization code.');
    }
  }

  /**
   * Retrieves temporary authorization code data from the database.
   * @param authCode The unique authorization code identifier.
   * @returns The stored temp auth code data, or undefined if not found or expired.
   */
  public async getTempAuthCode(authCode: string): Promise<TempAuthCodeData | undefined> {
    try {
      const result = await db.query.oauthTempAuthCodes.findFirst({
        where: eq(oauthTempAuthCodes.code, authCode),
      });

      if (result && result.expiresAt > new Date()) {
        logger.debug('Temp auth code retrieved from database', { authCode, found: true });
        return result.data;
      }

      logger.debug('Temp auth code not found or expired in database', { authCode });
      return undefined;
    } catch (error) {
      logger.error('Failed to retrieve temp auth code from database', { authCode, error });
      throw new DatabaseError('Could not retrieve temporary authorization code.');
    }
  }

  /**
   * Deletes temporary authorization code data from the database.
   * @param authCode The unique authorization code identifier to clear.
   */
  public async clearTempAuthCode(authCode: string): Promise<void> {
    try {
      await db.delete(oauthTempAuthCodes).where(eq(oauthTempAuthCodes.code, authCode));
      logger.debug('Temp auth code cleared from database', { authCode });
    } catch (error) {
      logger.error('Failed to clear temp auth code from database', { authCode, error });
    }
  }

  /**
   * Retrieves session data from the database using the state key.
   * @param state The unique state identifier.
   * @returns The stored session data, or undefined if not found or expired.
   */
  public async getSessionData(state: string): Promise<SessionData | undefined> {
    try {
      const result = await db.query.oauthSessions.findFirst({
        where: eq(oauthSessions.state, state),
      });

      if (result && result.expiresAt > new Date()) {
        logger.debug('Session data retrieved from database', { state, found: true });
        return result.sessionData as SessionData;
      }

      logger.debug('Session data not found or expired in database', { state });
      return undefined;
    } catch (error) {
      logger.error('Failed to retrieve session data from database', { state, error });
      throw new DatabaseError('Could not retrieve OAuth session state.');
    }
  }

  /**
   * Deletes session data from the database for a given state key.
   * @param state The unique state identifier to clear.
   */
  public async clearSessionData(state: string): Promise<void> {
    try {
      await db.delete(oauthSessions).where(eq(oauthSessions.state, state));
      logger.debug('Session data cleared from database', { state });
    } catch (error) {
      logger.error('Failed to clear session data from database', { state, error });
    }
  }

  /**
   * Atomically retrieves and deletes a temporary authorization code from the database.
   * This prevents race conditions where a code could be used multiple times.
   * @param authCode The unique authorization code identifier.
   * @returns The stored temp auth code data, or undefined if not found, expired, or invalid.
   */
  public async getAndClearTempAuthCode(authCode: string): Promise<TempAuthCodeData | undefined> {
    return await withUserContext('system', async (tx: DatabaseTransaction) => {
      const deletedRecords = await tx
        .delete(oauthTempAuthCodes)
        .where(eq(oauthTempAuthCodes.code, authCode))
        .returning();

      if (deletedRecords.length === 0) {
        logger.debug('No temp auth code found for deletion.', { authCode });
        return undefined;
      }

      const record = deletedRecords[0];

      if (record.expiresAt <= new Date()) {
        logger.debug('Temp auth code has expired, but was cleaned up during atomic retrieval.', {
          authCode,
          expired: record.expiresAt,
        });
        return undefined;
      }

      return record.data;
    });
  }

  /**
   * Atomically retrieves and deletes OAuth session data from the database.
   * This prevents race conditions where a state parameter could be used multiple times.
   * @param state The unique state identifier.
   * @returns The stored session data, or undefined if not found or already used.
   */
  public async getAndClearSessionData(state: string): Promise<SessionData | undefined> {
    return await withUserContext('system', async (tx: DatabaseTransaction) => {
      const deletedRecords = await tx
        .delete(oauthSessions)
        .where(eq(oauthSessions.state, state))
        .returning();

      if (deletedRecords.length === 0) {
        logger.debug('No OAuth session found for deletion.', { state });
        return undefined;
      }

      const record = deletedRecords[0];

      if (record.expiresAt.getTime() < Date.now()) {
        logger.debug('OAuth session has expired.', {
          state,
          expired: record.expiresAt,
        });
        return undefined;
      }

      return record.sessionData as SessionData;
    });
  }

  /**
   * Periodically cleans up all expired OAuth sessions from the database.
   * This is intended to be run by a scheduled job (e.g., cron).
   */
  public async cleanupExpiredSessions(): Promise<void> {
    await withUserContext('system', async (tx: DatabaseTransaction) => {
      const now = new Date();

      await tx.delete(oauthSessions).where(lt(oauthSessions.expiresAt, now));

      await tx.delete(oauthTempAuthCodes).where(lt(oauthTempAuthCodes.expiresAt, now));

      logger.info('Cleaned up expired OAuth sessions and temp auth codes.');
    });
  }
}
