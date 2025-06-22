import type { MetaAdAccountAssignedUsersResponse } from '../../types/meta.js';
import { discoverAndCacheBusinessContext } from '../../utils/businessContextManager.js';
import { InitializationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import {
  classifyMetaPermissionError,
  createPermissionsFetchRequest,
  executeLargeBatchRequests,
} from '../../utils/metaBatchHelper.js';
import type { BatchResponse } from '../../utils/metaBatchHelper.js';
import {
  MetaPermissionHandler,
  PERSONAL_ACCOUNT_DEFAULT_PERMISSIONS,
} from './permissionHandler.js';

// Define a type for the account data structures this processor will handle
type AccountData = {
  id: string;
  name: string;
  status: string;
  currency: string;
  timezone: string;
  businessId: string | null | undefined;
};

export class AdAccountPermissionsProcessor {
  private readonly userId: string;
  private readonly accessToken: string;
  private readonly metaUserId: string;

  constructor(userId: string, accessToken: string, metaUserId: string) {
    // Guard clause: Validate required parameters for fail-fast behavior
    if (!userId || typeof userId !== 'string') {
      throw new InitializationError('userId is required and must be a non-empty string');
    }
    if (!accessToken || typeof accessToken !== 'string') {
      throw new InitializationError('accessToken is required and must be a non-empty string');
    }
    if (!metaUserId || typeof metaUserId !== 'string') {
      throw new InitializationError('metaUserId is required and must be a non-empty string');
    }

    this.userId = userId;
    this.accessToken = accessToken;
    this.metaUserId = metaUserId;
  }

  private parseJson<T>(json: string): T | null {
    try {
      return JSON.parse(json) as T;
    } catch {
      return null;
    }
  }

  private logInvalidBatchResponse(response: BatchResponse | undefined, adAccountId: string) {
    const errorDetails: Record<string, unknown> = {
      adAccountId,
      responseCode: response?.code,
    };

    if (response?.body) {
      const parsedBody = this.parseJson<{
        error?: { code?: number; error_subcode?: number; type?: string; message?: string };
      }>(response.body);
      if (parsedBody?.error) {
        errorDetails.metaErrorCode = parsedBody.error.code;
        errorDetails.metaErrorSubcode = parsedBody.error.error_subcode;
        errorDetails.metaErrorType = parsedBody.error.type;
        errorDetails.metaErrorMessage = parsedBody.error.message;
      } else {
        errorDetails.rawErrorBody = response.body.substring(0, 500);
      }
    }

    logger.error('Failed batch request for ad account permissions', errorDetails);
  }

  private extractPermissionsFromBatchResponse(
    response: BatchResponse | undefined,
    adAccountId: string
  ): string[] {
    const defaultPermissions = ['UNKNOWN'];

    if (!response || response.code !== 200 || !response.body) {
      this.logInvalidBatchResponse(response, adAccountId);
      return defaultPermissions;
    }

    const permissionData = this.parseJson<MetaAdAccountAssignedUsersResponse>(response.body);
    if (!permissionData) {
      logger.error('Failed to parse permissions from batch response', {
        adAccountId,
        responseBodyPreview: response.body.substring(0, 200),
      });
      return defaultPermissions;
    }

    const userPermissions = permissionData.data?.find((user) => user.id === this.metaUserId);

    if (userPermissions?.tasks?.length) {
      return userPermissions.tasks;
    }

    logger.warn('User not found in batch permissions response or no tasks assigned', {
      adAccountId,
      metaUserId: this.metaUserId,
      availableUsers:
        permissionData.data?.map((u) => ({ id: u.id, taskCount: u.tasks?.length ?? 0 })) ?? [],
      totalUsersInResponse: permissionData.data?.length ?? 0,
    });

    return defaultPermissions;
  }

  /**
   * Handles business parameter errors with intelligent retry using individual API calls
   * This method is called when batch requests fail due to missing business parameters
   *
   * @param adAccountId - Ad account ID that failed
   * @returns Promise resolving to permissions array
   */
  private async handleBusinessParameterError(adAccountId: string): Promise<string[]> {
    logger.warn('Retrying permission fetch with business context discovery', {
      adAccountId,
      userId: this.userId,
      strategy: 'individual_api_call',
    });

    try {
      // Force business context rediscovery
      await discoverAndCacheBusinessContext(this.userId, this.accessToken, [adAccountId]);

      // Retry with fresh context using the more robust individual API service
      return await MetaPermissionHandler.fetchAdAccountPermissions(
        adAccountId,
        this.accessToken,
        this.metaUserId,
        this.userId,
        undefined // Force fresh lookup
      );
    } catch (error) {
      logger.error('Business parameter error recovery failed', {
        adAccountId,
        userId: this.userId,
        metaUserId: this.metaUserId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return ['UNKNOWN'];
    }
  }

  /**
   * Processes the permissions for a single account, handling special business parameter
   * error cases when encountered.
   */
  private async processAccountPermissions(
    accountData: AccountData,
    responseMap: Map<string, BatchResponse>
  ) {
    const response = responseMap.get(accountData.id);

    // Retry path when business parameter is required
    if (response && response.code === 400) {
      const errorBody = this.parseJson<{ error?: { code?: number; message?: string } }>(
        response.body || '{}'
      );
      if (classifyMetaPermissionError(errorBody?.error) === 'business_required') {
        logger.warn('Business parameter required error detected, attempting recovery', {
          adAccountId: accountData.id,
          userId: this.userId,
        });

        const recoveredPermissions = await this.handleBusinessParameterError(accountData.id);

        return { ...accountData, permissions: recoveredPermissions };
      }
    }

    // Default path
    const permissions = this.extractPermissionsFromBatchResponse(response, accountData.id);
    return { ...accountData, permissions };
  }

  /**
   * Attaches permissions to every account using Meta batch APIs while gracefully
   * handling partial failures. This is the primary public method of this class.
   */
  public async attachPermissions(
    accounts: AccountData[]
  ): Promise<Array<AccountData & { permissions: string[] }>> {
    if (accounts.length === 0) return [];

    const finalAccountsWithPermissions: Array<AccountData & { permissions: string[] }> = [];

    // Separate personal accounts from those requiring batch API calls
    const personalAccounts = accounts.filter((acc) => acc.businessId === null);
    const accountsToBatch = accounts.filter((acc) => acc.businessId !== null);

    // Handle personal accounts locally by assigning default owner permissions
    for (const acc of personalAccounts) {
      logger.info('Assigning default permissions for personal ad account in batch flow', {
        adAccountId: acc.id,
        userId: this.userId,
        reason: 'Personal account detected (businessId is null)',
        defaultPermissions: PERSONAL_ACCOUNT_DEFAULT_PERMISSIONS,
      });
      finalAccountsWithPermissions.push({
        ...acc,
        permissions: PERSONAL_ACCOUNT_DEFAULT_PERMISSIONS,
      });
    }

    // If no other accounts need batch processing, return early
    if (accountsToBatch.length === 0) {
      return finalAccountsWithPermissions;
    }

    // Process business-managed accounts using the batch API
    const permissionRequests = accountsToBatch.map((a) =>
      createPermissionsFetchRequest(a.id, a.businessId)
    );

    const batchResponses = await executeLargeBatchRequests(permissionRequests, this.accessToken);
    const responseMap = new Map(
      batchResponses.map((res) => [res.id.replace('permissions_', ''), res])
    );

    const promises = accountsToBatch.map((acc) => this.processAccountPermissions(acc, responseMap));
    const settled = await Promise.allSettled(promises);

    // Combine batch results with the locally-handled personal accounts
    for (const [index, result] of settled.entries()) {
      if (result.status === 'fulfilled') {
        finalAccountsWithPermissions.push(result.value);
      } else {
        const failedAccount = accountsToBatch[index];
        logger.error('Failed to process permissions for a batched ad account, applying default', {
          adAccountId: failedAccount.id,
          userId: this.userId,
          reason: result.reason instanceof Error ? result.reason.message : result.reason,
        });
        // Add the account back with default permissions to prevent silent dropping
        finalAccountsWithPermissions.push({
          ...failedAccount,
          permissions: ['UNKNOWN'],
        });
      }
    }

    return finalAccountsWithPermissions;
  }
}
