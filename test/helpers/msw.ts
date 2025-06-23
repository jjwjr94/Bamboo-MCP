// Import test environment setup first to configure env vars before any other imports
import './testEnv.js';

import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { env } from '../../src/utils/env.js';

// Define common base URL
const META_GRAPH_API_URL = `https://graph.facebook.com/${env.META_API_VERSION}`;

// Create handlers array for common handlers
const handlers = [
  // Default handler for unhandled requests to help catch missing mocks
  http.all(`${META_GRAPH_API_URL}/*`, ({ request }) => {
    console.error(`[MSW] Unhandled request: ${request.method} ${request.url}`);
    console.error(`[MSW] Expected base URL: ${META_GRAPH_API_URL}`);
    console.error(`[MSW] Available handlers should match: ${META_GRAPH_API_URL}/*`);
    return HttpResponse.json(
      {
        error: {
          message: 'Unhandled request in MSW mock setup',
          type: 'TestError',
          code: 999,
        },
      },
      { status: 501 }
    );
  }),
];

export const server = setupServer(...handlers);

// Helper to create mock API URLs
export const createMetaUrl = (path: string) => `${META_GRAPH_API_URL}${path}`;

// Helper to create mock handler for successful responses
export const createSuccessHandler = (
  method: 'get' | 'post' | 'patch' | 'delete',
  url: string,
  responseData: Record<string, unknown> | unknown[],
  status = 200
) => {
  // Use a glob pattern to match the URL regardless of query parameters
  return http[method](`${url}*`, () => {
    return HttpResponse.json(responseData, { status });
  });
};

// Helper to create mock handler for error responses
export const createErrorHandler = (
  method: 'get' | 'post' | 'patch' | 'delete',
  url: string,
  errorData: Record<string, unknown> | unknown[],
  status = 400
) => {
  // Use a glob pattern to match the URL regardless of query parameters
  return http[method](`${url}*`, () => {
    return HttpResponse.json(errorData, { status });
  });
};

// Helper to create mock handler for network errors
export const createNetworkErrorHandler = (
  method: 'get' | 'post' | 'patch' | 'delete',
  url: string
) => {
  // Use a glob pattern to match the URL regardless of query parameters
  return http[method](`${url}*`, () => {
    return HttpResponse.error();
  });
};
