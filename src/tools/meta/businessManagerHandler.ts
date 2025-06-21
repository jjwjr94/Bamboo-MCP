import { Business as MetaBusinessSDK, User as MetaUserSDK } from 'facebook-nodejs-business-sdk';
import {
  MetaBusinessResponseSchema,
  MetaBusinessUserResponseSchema,
} from '../../generated/schemas.js';
import { createMcpSuccessResult } from '../../mcp/responseHelper.js';
import type { JWTPayload } from '../../types/auth.js';
import { env } from '../../utils/env.js';
import { logger } from '../../utils/logger.js';
import { handleMetaApiCall, initializeMetaApi } from './api.js';
import { fetchAllPaginatedData } from './paginationHelper.js';

export class MetaBusinessManagerHandler {
  async getBusinessAccounts(authPayload: JWTPayload) {
    logger.info('Executing get_business_accounts', { userId: authPayload.userId });
    await initializeMetaApi(authPayload.userId);

    return handleMetaApiCall(async () => {
      const fields = 'id,name,created_time,link,verification_status,vertical,timezone_id';

      try {
        const businessesCursor = await new MetaUserSDK('me').getBusinesses([fields]);

        // Use the common pagination utility to handle all edge cases
        const allRawBusinesses = await fetchAllPaginatedData<unknown>({
          cursor: businessesCursor,
          limit: env.META_MAX_BUSINESS_ACCOUNTS_TO_FETCH,
          entityName: 'business accounts',
          userId: authPayload.userId,
        });

        // Validate each business account using the generated schema
        const validatedBusinesses = [];
        for (const business of allRawBusinesses) {
          const result = MetaBusinessResponseSchema.safeParse(business);
          if (result.success) {
            validatedBusinesses.push(result.data);
          } else {
            logger.warn('Skipping invalid business account data from Meta API', {
              businessId: (business as { id?: string })?.id || 'unknown',
              errors: result.error.format(),
            });
          }
        }

        const response = {
          businesses: validatedBusinesses,
        };

        return createMcpSuccessResult(
          response,
          `Retrieved ${validatedBusinesses.length} business accounts`
        );
      } catch (error) {
        logger.error('Failed to fetch business accounts from Meta API', {
          userId: authPayload.userId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error;
      }
    });
  }

  async getBusinessUsers(authPayload: JWTPayload, params: { businessId: string }) {
    logger.info('Executing get_business_users', {
      userId: authPayload.userId,
      businessId: params.businessId,
    });
    await initializeMetaApi(authPayload.userId);

    return handleMetaApiCall(async () => {
      const business = new MetaBusinessSDK(params.businessId);
      const fields = [
        'id',
        'name',
        'email',
        'first_name',
        'last_name',
        'role',
        'title',
        'finance_permission',
        'ip_permission',
        'two_fac_status',
        'pending_email',
      ];

      // Get business users using the SDK with proper pagination
      const businessUsersCursor = await business.getBusinessUsers(fields);

      // Custom extractor to handle the _data property from the SDK response
      const userExtractor = (userNode: unknown) =>
        (userNode as { _data?: unknown })._data || userNode;

      // Use the common pagination utility to handle all edge cases
      const allRawUsers = await fetchAllPaginatedData<unknown>({
        cursor: businessUsersCursor,
        limit: env.META_MAX_BUSINESS_USERS_TO_FETCH,
        entityName: 'business users',
        userId: authPayload.userId,
        apiContext: { businessId: params.businessId },
        dataExtractor: userExtractor,
      });

      // Validate each user using the generated schema
      const validatedUsers = [];
      for (const userData of allRawUsers) {
        const result = MetaBusinessUserResponseSchema.safeParse(userData);
        if (result.success) {
          validatedUsers.push(result.data);
        } else {
          logger.warn('Skipping invalid business user data from Meta API', {
            userId: (userData as { id?: string })?.id || 'unknown',
            businessId: params.businessId,
            errors: result.error.format(),
          });
        }
      }

      logger.info('Successfully retrieved business users', {
        businessId: params.businessId,
        userCount: validatedUsers.length,
      });

      const response = {
        users: validatedUsers,
        businessId: params.businessId,
      };

      return createMcpSuccessResult(
        response,
        `Retrieved ${validatedUsers.length} business users for business ${params.businessId}`
      );
    });
  }
}
