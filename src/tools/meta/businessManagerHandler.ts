import { Business as MetaBusinessSDK } from 'facebook-nodejs-business-sdk';
import {
  MetaBusinessResponseSchema,
  MetaBusinessUserResponseSchema,
} from '../../generated/schemas.js';
import { createMcpSuccessResult } from '../../mcp/responseHelper.js';
import type { JWTPayload } from '../../types/auth.js';
import { logger } from '../../utils/logger.js';
import { handleMetaApiCall, initializeMetaApi } from './api.js';

const MAX_BUSINESS_USERS_TO_FETCH = 1000;
const MAX_BUSINESS_ACCOUNTS_TO_FETCH = 100; // Most users have limited business accounts

export class MetaBusinessManagerHandler {
  async getBusinessAccounts(authPayload: JWTPayload) {
    logger.info('Executing get_business_accounts', { userId: authPayload.userId });
    await initializeMetaApi(authPayload.userId);

    return handleMetaApiCall(async () => {
      const fields = 'id,name,created_time,link,verification_status,vertical,timezone_id';

      try {
        const business = new MetaBusinessSDK();
        const businessesCursor = await business.getOwnedBusinesses([fields]);

        // Handle pagination - fetch all pages with safety limit
        let currentCursor = businessesCursor as any; // Cast to access pagination methods
        const allRawBusinesses: any[] = [];

        // Check if we have data in the cursor
        if (currentCursor && typeof currentCursor === 'object' && 'data' in currentCursor) {
          // Handle the initial response structure
          allRawBusinesses.push(...(currentCursor.data || []));

          // Check for pagination
          while (currentCursor && currentCursor.paging && currentCursor.paging.next) {
            // Safety limit to prevent resource exhaustion
            if (allRawBusinesses.length >= MAX_BUSINESS_ACCOUNTS_TO_FETCH) {
              logger.warn('Reached maximum business accounts limit, truncating results', {
                limit: MAX_BUSINESS_ACCOUNTS_TO_FETCH,
                userId: authPayload.userId,
              });
              break;
            }

            // Fetch next page
            if (typeof currentCursor.hasNext === 'function' && currentCursor.hasNext()) {
              currentCursor = await currentCursor.next();
              if (currentCursor && currentCursor.data) {
                allRawBusinesses.push(...currentCursor.data);
              }
            } else {
              break;
            }
          }
        } else if (Array.isArray(currentCursor)) {
          // Handle array response
          allRawBusinesses.push(...currentCursor);
        }

        // Validate each business account using the generated schema
        const validatedBusinesses = [];
        for (const business of allRawBusinesses) {
          const result = MetaBusinessResponseSchema.safeParse(business);
          if (result.success) {
            validatedBusinesses.push(result.data);
          } else {
            logger.warn('Skipping invalid business account data from Meta API', {
              businessId: business?.id || 'unknown',
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

      // Handle pagination - fetch all pages with safety limit
      let currentCursor = businessUsersCursor as any; // Cast to access pagination methods
      const allRawUsers: any[] = [];

      while (currentCursor && currentCursor.length > 0) {
        // Extract user data from the cursor
        const userList = Array.from(currentCursor);
        const users = userList.map((userNode: any) => userNode._data || userNode);
        allRawUsers.push(...users);

        // Safety limit to prevent resource exhaustion
        if (allRawUsers.length >= MAX_BUSINESS_USERS_TO_FETCH) {
          logger.warn('Reached maximum business users limit, truncating results', {
            limit: MAX_BUSINESS_USERS_TO_FETCH,
            businessId: params.businessId,
          });
          break;
        }

        if (typeof currentCursor.hasNext === 'function' && currentCursor.hasNext()) {
          currentCursor = await currentCursor.next();
        } else {
          break;
        }
      }

      // Validate each user using the generated schema
      const validatedUsers = [];
      for (const userData of allRawUsers) {
        const result = MetaBusinessUserResponseSchema.safeParse(userData);
        if (result.success) {
          validatedUsers.push(result.data);
        } else {
          logger.warn('Skipping invalid business user data from Meta API', {
            userId: userData?.id || 'unknown',
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
