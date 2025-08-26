import { MetaPermissionHandler } from '../tools/meta/permissionHandler.js';
import {
  discoverAndCacheBusinessContext,
  getBusinessIdForAdAccount,
} from './businessContextManager.js';
import { NotFoundError } from './errors.js';
import { logger } from './logger.js';

/**
 * Business Context Coordinator
 *
 * This service coordinates business context resolution across the application,
 * providing a unified interface for handling business-managed ad accounts.
 * It implements multiple fallback strategies to ensure robust business context resolution.
 */
export namespace BusinessContextCoordinator {
  /**
   * Ensures business context is available for a set of ad accounts.
   * This method is designed to be called before any operation that might require business context.
   *
   * @param userId - The user ID for security context
   * @param accessToken - Meta access token for API calls
   * @param adAccountIds - Array of ad account IDs to ensure business context for
   */
  export async function ensureBusinessContext(
    userId: string,
    accessToken: string,
    adAccountIds: string[]
  ): Promise<void> {
    if (adAccountIds.length === 0) {
      return;
    }

    logger.debug('Ensuring business context availability', {
      userId,
      adAccountCount: adAccountIds.length,
    });

    // Check which ad accounts need business context discovery
    const accountsNeedingDiscovery: string[] = [];

    for (const adAccountId of adAccountIds) {
      try {
        const existingBusinessId = await getBusinessIdForAdAccount(userId, adAccountId);
        // If we get null, the account exists in DB but is not business-managed
        // No need to discover business context for non-business accounts
        logger.debug('Business context already available', {
          adAccountId,
          businessId: existingBusinessId,
          isBusinessManaged: existingBusinessId !== null,
        });
      } catch (error) {
        // If NotFoundError, the account doesn't exist in database - needs discovery
        // If other error, database lookup failed - also needs discovery
        if (error instanceof NotFoundError || error instanceof Error) {
          accountsNeedingDiscovery.push(adAccountId);
          logger.debug('Ad account needs business context discovery', {
            adAccountId,
            reason: error instanceof NotFoundError ? 'not_in_database' : 'lookup_failed',
            error: error.message,
          });
        }
      }
    }

    if (accountsNeedingDiscovery.length > 0) {
      logger.info('Discovering business context for ad accounts', {
        userId,
        accountsNeedingDiscovery: accountsNeedingDiscovery.length,
        adAccountIds: accountsNeedingDiscovery,
      });

      await discoverAndCacheBusinessContext(userId, accessToken, accountsNeedingDiscovery);
    }
  }

  /**
   * Validates and attempts to recover from business context resolution failures.
   * This method implements multiple recovery strategies for ad accounts that are
   * causing business parameter errors.
   *
   * @param userId - The user ID for security context
   * @param accessToken - Meta access token for API calls
   * @param adAccountId - The problematic ad account ID
   * @param currentUserId - The Meta user ID
   * @returns Promise that resolves with recovered permissions or null if recovery failed
   */
  export async function recoverFromBusinessContextFailure(
    userId: string,
    accessToken: string,
    adAccountId: string,
    currentUserId: string
  ): Promise<string[] | null> {
    logger.warn('Attempting business context failure recovery', {
      userId,
      adAccountId,
      currentUserId,
    });

    try {
      // Strategy 1: Force business context rediscovery across all accounts
      await discoverAndCacheBusinessContext(userId, accessToken, [adAccountId]);

      // Strategy 2: Retry permission fetch with fresh business context
      const recoveredPermissions = await MetaPermissionHandler.fetchAdAccountPermissions(
        adAccountId,
        accessToken,
        currentUserId,
        userId,
        undefined // Force fresh lookup
      );

      if (
        recoveredPermissions &&
        recoveredPermissions.length > 0 &&
        recoveredPermissions[0] !== 'UNKNOWN'
      ) {
        logger.info('Successfully recovered from business context failure', {
          userId,
          adAccountId,
          currentUserId,
          recoveredPermissions,
        });
        return recoveredPermissions;
      }

      logger.warn('Business context recovery completed but permissions still unknown', {
        userId,
        adAccountId,
        currentUserId,
        recoveredPermissions,
      });
      return null;
    } catch (error) {
      logger.error('Business context recovery failed', {
        userId,
        adAccountId,
        currentUserId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Performs a health check on business context resolution for a user's ad accounts.
   * This can be used to proactively identify and fix business context issues.
   *
   * @param userId - The user ID to check
   * @param accessToken - Meta access token for API calls
   * @returns Summary of business context health
   */
  export async function performBusinessContextHealthCheck(
    userId: string,
    _accessToken: string
  ): Promise<{
    totalAccounts: number;
    businessManagedAccounts: number;
    accountsWithoutBusinessContext: number;
    problematicAccounts: string[];
  }> {
    logger.info('Performing business context health check', { userId });

    try {
      // This would require access to the user's ad accounts list
      // Implementation would depend on how ad accounts are stored/retrieved

      // For now, return a placeholder result
      return {
        totalAccounts: 0,
        businessManagedAccounts: 0,
        accountsWithoutBusinessContext: 0,
        problematicAccounts: [],
      };
    } catch (error) {
      logger.error('Business context health check failed', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        totalAccounts: 0,
        businessManagedAccounts: 0,
        accountsWithoutBusinessContext: 0,
        problematicAccounts: [],
      };
    }
  }
}
