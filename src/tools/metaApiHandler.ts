import type { JWTPayload } from '../types/auth.js';
import { logger } from '../utils/logger.js';
import { handleMetaApiCall, initializeMetaApi } from './metaApi.js';

type MetaApiParameters = Record<
  string,
  string | number | boolean | undefined | Array<unknown> | Record<string, unknown>
>;

export class MetaApiHandler {
  async callMetaApi(
    authPayload: JWTPayload,
    params: {
      endpoint: string;
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      fields?: string[];
      parameters?: MetaApiParameters;
    }
  ) {
    logger.info('Executing call_meta_api', { userId: authPayload.userId, params });

    const api = await initializeMetaApi(authPayload.userId);

    return await handleMetaApiCall(async () => {
      const { endpoint, method = 'GET', fields, parameters = {} } = params;

      // Prepare parameters with optional fields attribute
      const requestParams: MetaApiParameters = { ...parameters };
      if (fields && fields.length > 0) {
        requestParams.fields = fields.join(',');
      }

      const endpointParts = endpoint.split('/');
      const responseData = await api.call(method, endpointParts, requestParams);

      return {
        structuredContent: { responseData },
        content: [{ type: 'text' as const, text: JSON.stringify(responseData, null, 2) }],
      };
    });
  }
}
