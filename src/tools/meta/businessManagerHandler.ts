import { Business as MetaBusinessSDK, User as MetaUserSDK } from 'facebook-nodejs-business-sdk';
import type { z } from 'zod';
import {
  MetaBusinessResponseSchema,
  MetaBusinessUserResponseSchema,
} from '../../generated/schemas.js';
import type { JWTPayload } from '../../types/auth.js';
import { env } from '../../utils/env.js';
import { logger } from '../../utils/logger.js';
import { createMetaApiInstance, handleMetaApiCall } from './api.js';
import { fetchAllPaginatedData } from './paginationHelper.js';
import type { GetBusinessAccountsResult, GetBusinessUsersResult } from './types.js';

export class MetaBusinessManagerHandler {
  async getBusinessAccounts(authPayload: JWTPayload): Promise<GetBusinessAccountsResult> {
    logger.info('Executing get_business_accounts', { userId: authPayload.userId });

    return handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        const fields = ['id', 'name', 'verification_status', 'vertical', 'link'];

        const businessAccountsCursor = await new MetaUserSDK('me', {}, null, api).getBusinesses(
          fields
        );

        const allRawBusinesses = await fetchAllPaginatedData<unknown>({
          cursor: businessAccountsCursor,
          limit: env.META_MAX_BUSINESS_ACCOUNTS_TO_FETCH,
          entityName: 'business accounts',
          userId: authPayload.userId,
          apiContext: {},
        });

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

        return response;
      },
      {
        toolName: 'get_business_accounts',
        userId: authPayload.userId,
      }
    );
  }

  async getBusinessUsers(
    authPayload: JWTPayload,
    params: { businessId: string }
  ): Promise<GetBusinessUsersResult> {
    logger.info('Executing get_business_users', { userId: authPayload.userId, params });

    return handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        // Instantiate Business object once and reuse it to fetch users
        const business = new MetaBusinessSDK(params.businessId, {}, null, api);
        const fields = ['id', 'name', 'email', 'role', 'pending'];

        const businessUsersCursor = await business.getBusinessUsers(fields);

        const allRawUsers = await fetchAllPaginatedData<unknown>({
          cursor: businessUsersCursor,
          limit: env.META_MAX_BUSINESS_USERS_TO_FETCH,
          entityName: 'business users',
          userId: authPayload.userId,
          apiContext: { businessId: params.businessId },
        });

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

        return response;
      },
      {
        toolName: 'get_business_users',
        userId: authPayload.userId,
      }
    );
  }
}
