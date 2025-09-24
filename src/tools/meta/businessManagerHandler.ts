import { Business as MetaBusinessSDK, User as MetaUserSDK } from 'facebook-nodejs-business-sdk';
import type { z } from 'zod';
import {
  MetaBusinessResponseSchema,
  MetaBusinessUserResponseSchema,
} from '../../generated/schemas.js';
import type { JWTPayload } from '../../types/auth.js';
import { env } from '../../utils/env.js';
import { logger } from '../../utils/logger.js';
import { createMetaApiInstance, getApiInstanceUserId, handleMetaApiCall } from './api.js';
import { fetchAllPaginatedData } from './paginationHelper.js';
import type { GetBusinessAccountsResult, GetBusinessUsersResult } from './types.js';

export class MetaBusinessManagerHandler {
  async getBusinessAccounts(authPayload: JWTPayload): Promise<GetBusinessAccountsResult> {
    logger.info('Executing get_business_accounts', { userId: authPayload.userId });

    return handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(getApiInstanceUserId(authPayload));

        const fields = ['id', 'name', 'verification_status', 'vertical', 'link'];

        const businessAccountsCursor = await new MetaUserSDK('me', {}, null, api).getBusinesses(
          fields
        );

        const allRawBusinesses = await fetchAllPaginatedData<unknown>({
          cursor: businessAccountsCursor,
          limit: 100,  // Max business accounts to fetch
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

        // Transform to match Meta API v22+ actual response schema
        // Note: Using type assertion here is safe because data is already validated by MetaBusinessResponseSchema
        const transformedBusinesses = validatedBusinesses.map((business) => ({
          id: business.id as string,
          name: business.name as string,
          created_time: business.created_time as string | undefined,
          timezone_id: business.timezone_id as string | undefined, // Meta API returns string, not number
          primary_page: business.primary_page as string | undefined,
          vertical: business.vertical as string | undefined,
          two_factor_type: business.two_factor_type as string | undefined,
        }));

        const response = { businessAccounts: transformedBusinesses };
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
        const api = await createMetaApiInstance(getApiInstanceUserId(authPayload));

        // Instantiate Business object once and reuse it to fetch users
        const business = new MetaBusinessSDK(params.businessId, {}, null, api);
        const fields = ['id', 'name', 'email', 'role', 'pending'];

        const businessUsersCursor = await business.getBusinessUsers(fields);

        const allRawUsers = await fetchAllPaginatedData<unknown>({
          cursor: businessUsersCursor,
          limit: 1000,  // Max business users to fetch
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

        // Transform to match Meta API v22+ actual response schema
        // Note: Using type assertion here is safe because data is already validated by MetaBusinessUserResponseSchema
        const transformedUsers = validatedUsers.map((user) => ({
          id: user.id as string,
          name: user.name as string | undefined,
          first_name: user.first_name as string | undefined,
          last_name: user.last_name as string | undefined,
          email: user.email as string | undefined,
          role: user.role as string | undefined,
          title: user.title as string | undefined,
          work_email: user.work_email as string | undefined,
          permissions: user.permissions as string[] | undefined,
          finance_permission: user.finance_permission as string | undefined,
          created_time: user.created_time as string | undefined,
        }));

        const response = { businessUsers: transformedUsers };
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
