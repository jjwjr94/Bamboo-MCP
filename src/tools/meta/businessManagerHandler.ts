import { Business as MetaBusinessSDK, User as MetaUserSDK } from 'facebook-nodejs-business-sdk';
import type { z } from 'zod';
import {
  MetaBusinessResponseSchema,
  MetaBusinessUserResponseSchema,
} from '../../generated/schemas.js';
import { createMcpSuccessResult } from '../../mcp/responseHelper.js';
import type { JWTPayload } from '../../types/auth.js';
import { env } from '../../utils/env.js';
import { logger } from '../../utils/logger.js';
import { createMetaApiInstance, handleMetaApiCall } from './api.js';
import { fetchAllPaginatedData } from './paginationHelper.js';

export class MetaBusinessManagerHandler {
  async getBusinessAccounts(authPayload: JWTPayload) {
    logger.info('Executing get_business_accounts', { userId: authPayload.userId });

    return handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        const fields = ['id', 'name', 'verification_status', 'vertical', 'link'];

        const businessesCursor = await new MetaUserSDK('me', {}, null, api).getBusinesses(fields);

        // Use the common pagination utility to handle all edge cases
        const allRawBusinesses = await fetchAllPaginatedData<unknown>({
          cursor: businessesCursor,
          limit: env.META_MAX_BUSINESS_ACCOUNTS_TO_FETCH,
          entityName: 'business accounts',
          userId: authPayload.userId,
        });

        // Validate each business using the auto-generated schema
        const validatedBusinesses: z.infer<typeof MetaBusinessResponseSchema>[] = [];
        for (const business of allRawBusinesses) {
          const result = MetaBusinessResponseSchema.safeParse(business);
          if (result.success) {
            validatedBusinesses.push(result.data);
          } else {
            logger.warn('Invalid business data received from Meta API, skipping.', {
              error: result.error.format(),
              business,
              userId: authPayload.userId,
            });
          }
        }

        const response = { businesses: validatedBusinesses };
        logger.info('Successfully retrieved business accounts', {
          userId: authPayload.userId,
          count: validatedBusinesses.length,
        });

        return await createMcpSuccessResult(response);
      },
      {
        toolName: 'get_business_accounts',
        userId: authPayload.userId,
      }
    );
  }

  async getBusinessUsers(authPayload: JWTPayload, params: { businessId: string }) {
    logger.info('Executing get_business_users', { userId: authPayload.userId, params });

    return handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        const business = new MetaBusinessSDK(params.businessId, {}, null, api);
        const fields = ['id', 'name', 'email', 'role', 'pending'];

        const usersCursor = await business.getBusinessUsers(fields);

        // Use the common pagination utility to handle all edge cases
        const allRawUsers = await fetchAllPaginatedData<unknown>({
          cursor: usersCursor,
          limit: env.META_MAX_BUSINESS_USERS_TO_FETCH,
          entityName: 'business users',
          userId: authPayload.userId,
          apiContext: { businessId: params.businessId },
          dataExtractor: (item: unknown) => (item as { _data?: unknown })._data || item,
        });

        // Validate each user using the auto-generated schema
        const validatedUsers: z.infer<typeof MetaBusinessUserResponseSchema>[] = [];
        for (const user of allRawUsers) {
          const result = MetaBusinessUserResponseSchema.safeParse(user);
          if (result.success) {
            validatedUsers.push(result.data);
          } else {
            logger.warn('Invalid business user data received from Meta API, skipping.', {
              error: result.error.format(),
              user,
              userId: authPayload.userId,
              businessId: params.businessId,
            });
          }
        }

        const response = { users: validatedUsers };
        logger.info('Successfully retrieved business users', {
          userId: authPayload.userId,
          businessId: params.businessId,
          count: validatedUsers.length,
        });

        return await createMcpSuccessResult(response);
      },
      {
        toolName: 'get_business_users',
        userId: authPayload.userId,
      }
    );
  }
}
