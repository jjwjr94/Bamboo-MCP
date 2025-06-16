# API Reference

## OAuth Endpoints

### `GET /.well-known/oauth-authorization-server`
Returns OAuth server metadata for MCP compliance.

**Response:**
```json
{
  "issuer": "https://yourdomain.com",
  "authorization_endpoint": "https://yourdomain.com/authorize",
  "token_endpoint": "https://yourdomain.com/token",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code"],
  "code_challenge_methods_supported": ["S256"],
  "scopes_supported": ["ads_management", "business_management"]
}
```

### `GET /authorize`
Initiates OAuth authorization flow with PKCE.

**Query Parameters:**
- `client_id` (required): OAuth client identifier
- `redirect_uri` (required): Callback URL after authorization
- `state` (optional): State parameter for CSRF protection
- `code_challenge` (required): PKCE code challenge
- `code_challenge_method` (required): Must be "S256"
- `scope` (optional): Requested scopes (default: "ads_management,business_management")

**Response:** Redirects to Facebook OAuth with encoded state

### `GET /auth/facebook/callback`
Handles Facebook OAuth callback and token exchange.

**Query Parameters:**
- `code` (required): Authorization code from Facebook
- `state` (required): Encoded session state

**Success Response:** Redirects to client with authorization code
**Error Response:** 400/500 with error details

### `POST /token`
Exchanges authorization code for access token.

**Request Body:**
```json
{
  "grant_type": "authorization_code",
  "code": "authorization_code",
  "code_verifier": "pkce_code_verifier",
  "client_id": "client_identifier"
}
```

**Response:**
```json
{
  "access_token": "jwt_token",
  "token_type": "Bearer",
  "expires_in": 86400
}
```

## Health Check Endpoint

### `GET /health`
Returns system health status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "version": "0.1.0",
  "database": "connected",
  "mcp": "ready"
}
```

## MCP Server Implementation

### Transport Options
Bamboo MCP supports multiple transport modes:
- **Stdio**: For command-line and local integrations (recommended for development)
- **Streamable HTTP**: For HTTP-based streaming integrations (recommended for production)

### Server Architecture
Uses `@modelcontextprotocol/sdk` v1.12.3 with:
- `Server` class from `@modelcontextprotocol/sdk/server/index.js`
- `StdioServerTransport` for local development
- `StreamableHTTPServerTransport` for HTTP deployment

### MCP HTTP Endpoints

#### `POST /mcp`
Main MCP endpoint using Streamable HTTP transport for JSON-RPC communication.

**Headers:**
```
Content-Type: application/json
Authorization: Bearer <jwt_token>
```

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_ad_accounts",
    "arguments": {}
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"success\": true, \"data\": [...]}"
      }
    ]
  }
}
```

#### `GET /mcp` and `DELETE /mcp`
These methods are not allowed and return a 405 Method Not Allowed error.

**Response:**
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Method not allowed. Use POST for MCP requests."
  },
  "id": null
}
```

## MCP Tools

All MCP tools require Bearer token authentication and follow the MCP protocol specification.

**Multi-Account Handling:** When users have access to multiple ad accounts, tools return structured responses with account selection options if `adAccountId` is not provided. Claude will present the options and ask the user to choose.

**Enhanced Error Handling:** Tools use structured success/error responses instead of exceptions, providing Claude with actionable information for user interaction.

### **Account Management Tools**

### `get_ad_accounts`
Retrieves all ad accounts for the authenticated user.

**Input Schema:**
```json
{}
```

**Output:**
```json
{
  "success": true,
  "data": [
    {
      "id": "act_123456789",
      "name": "My Ad Account",
      "status": "ACTIVE",
      "currency": "USD",
      "timezone": "America/Los_Angeles",
      "permissions": ["MANAGE", "ADVERTISE"],
      "createdAt": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

### `get_business_accounts`
Retrieves business accounts and their associated ad accounts.

**Input Schema:**
```json
{}
```

**Output:**
```json
{
  "success": true,
  "data": [
    {
      "id": "business_123456789",
      "name": "My Business",
      "adAccounts": ["act_123456789", "act_987654321"]
    }
  ]
}
```

### **Campaign Management Tools**

### `get_campaigns`
Retrieves campaigns for an ad account.

**Input Schema:**
```json
{
  "adAccountId": "act_123456789",
  "limit": 25,
  "status": "ACTIVE"
}
```

**Output:**
```json
{
  "success": true,
  "data": [
    {
      "id": "23844000000000000",
      "name": "My Campaign",
      "status": "ACTIVE",
      "objective": "OUTCOME_TRAFFIC",
      "dailyBudget": 1000,
      "created_time": "2025-01-01T00:00:00+0000",
      "updated_time": "2025-01-01T00:00:00+0000"
    }
  ]
}
```

### `create_campaign`
Creates a new advertising campaign.

**Input Schema:**
```json
{
  "name": "Campaign Name",
  "objective": "OUTCOME_TRAFFIC",
  "status": "PAUSED",
  "adAccountId": "act_123456789",
  "dailyBudget": 1000,
  "specialAdCategories": []
}
```

**Objective Options:**
- `OUTCOME_TRAFFIC`: Drive traffic to website
- `OUTCOME_ENGAGEMENT`: Increase engagement
- `OUTCOME_LEADS`: Generate leads
- `OUTCOME_SALES`: Drive sales/conversions
- `OUTCOME_APP_PROMOTION`: Promote mobile app
- `OUTCOME_AWARENESS`: Build brand awareness

### `update_campaign`
Updates an existing campaign.

**Input Schema:**
```json
{
  "campaignId": "23844000000000001",
  "name": "Updated Campaign Name",
  "status": "ACTIVE",
  "dailyBudget": 1500
}
```

### `delete_campaign`
Deletes a campaign.

**Input Schema:**
```json
{
  "campaignId": "23844000000000001"
}
```

### **Ad Set Management Tools**

### `get_adsets`
Retrieves ad sets for a campaign or ad account.

**Input Schema:**
```json
{
  "campaignId": "23844000000000001",
  "limit": 25,
  "status": "ACTIVE"
}
```

### `create_adset`
Creates a new ad set within a campaign.

**Input Schema:**
```json
{
  "campaignId": "23844000000000001",
  "name": "Ad Set Name",
  "dailyBudget": 500,
  "targeting": {
    "geoLocations": {
      "countries": ["US", "CA"]
    },
    "ageMin": 18,
    "ageMax": 65,
    "genders": ["1", "2"]
  },
  "billingEvent": "LINK_CLICKS",
  "optimizationGoal": "LINK_CLICKS"
}
```

### `update_adset`
Updates an existing ad set.

### `delete_adset`
Deletes an ad set.

### **Ad Management Tools**

### `get_ads`
Retrieves ads for an ad set or campaign.

### `create_ad`
Creates a new ad within an ad set.

### `update_ad`
Updates an existing ad.

### `delete_ad`
Deletes an ad.

### **Creative Management Tools**

### `get_ad_creatives`
Retrieves ad creatives for an ad account.

### `create_ad_creative`
Creates a new ad creative.

### `update_ad_creative`
Updates an existing ad creative.

### `delete_ad_creative`
Deletes an ad creative.

### **Asset Management Tools**

### `get_uploaded_assets`
Retrieves all uploaded assets for an ad account with **inline image display** for Claude.

**Input Schema:**
```json
{
  "adAccountId": "act_123456789",
  "limit": 25,
  "type": "image"
}
```

**Enhanced Output with Inline Display:**
```json
{
  "success": true,
  "data": [
    {
      "id": "23844000000000005",
      "filename": "product-hero.jpg",
      "type": "image",
      "dimensions": "1200x800",
      "hash": "sha256_hash",
      "url": "https://scontent.xx.fbcdn.net/...",
      "thumbnailUrl": "https://scontent.xx.fbcdn.net/.../128x128",
      "createdTime": "2025-01-01T00:00:00+0000",
      "displayData": {
        "dataUri": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...",
        "alt": "product-hero.jpg - 1200x800"
      }
    }
  ],
  "displayInstructions": "Assets include inline display data. Images can be shown directly to users for selection.",
  "totalCount": 1
}
```

**Claude Integration:**
- Images are displayed inline using base64 data URIs
- Users can visually select assets with descriptive names and dimensions
- Prevents accidental selection of wrong assets

### `upload_ad_asset`
Uploads an image or video asset for use in ads.

**Input Schema:**
```json
{
  "filename": "image.jpg",
  "data": "base64_encoded_file_data",
  "type": "image",
  "adAccountId": "act_123456789"
}
```

### **Audience Management Tools**

### `get_custom_audiences`
Retrieves custom audiences for an ad account.

### `create_custom_audience`
Creates a new custom audience.

### `update_custom_audience`
Updates an existing custom audience.

### `delete_custom_audience`
Deletes a custom audience.

### **Insights & Reporting Tools**

### `get_account_insights`
Retrieves insights for an ad account.

### `get_campaign_insights`
Retrieves insights for campaigns.

### `get_adset_insights`
Retrieves insights for ad sets.

### `get_ad_insights`
Retrieves insights for ads.

### **Page Management Tools**

### `get_pages`
Retrieves Facebook Pages the user manages.

### `get_page_insights`
Retrieves insights for a Facebook Page.

### `create_page_post`
Creates a post on a Facebook Page.

### **Business Management Tools**

### `get_business_users`
Retrieves users associated with a business.

### `get_business_assets`
Retrieves assets (ad accounts, pages, etc.) for a business.

### **Commerce & Catalog Tools**

### `get_product_catalogs`
Retrieves product catalogs for commerce.

### `create_product_catalog`
Creates a new product catalog.

### `get_product_feeds`
Retrieves product feeds for a catalog.

### `create_product_feed`
Creates a new product feed.

### `get_products`
Retrieves products from a catalog.

### `create_product`
Creates a new product in a catalog.

### **Generic API Tool**

### `call_meta_api`
Makes a generic call to any Meta API endpoint not covered by specific tools.

**Input Schema:**
```json
{
  "endpoint": "/v22.0/act_123456789/campaigns",
  "method": "GET",
  "params": {
    "fields": "name,status,objective",
    "limit": 10
  }
}
```

**Note:** This tool provides access to the complete Meta API surface area, including new endpoints not yet wrapped in specific tools.

## MCP Resources

### `prompt://system`
Returns the Bamboo system prompt for context.

**URI:** `prompt://system`
**MIME Type:** `text/plain`
**Description:** Core system prompt for Bamboo MCP

### `prompt://best_practices`
Returns Meta Ads best practices guidelines.

**URI:** `prompt://best_practices`
**MIME Type:** `text/plain`
**Description:** Best practices for Meta advertising

## Error Responses

All API endpoints return structured error responses:

### HTTP Error Codes
- `400`: Bad Request - Invalid input parameters
- `401`: Unauthorized - Missing or invalid authentication
- `403`: Forbidden - Insufficient permissions
- `404`: Not Found - Resource not found
- `429`: Too Many Requests - Rate limit exceeded
- `500`: Internal Server Error - Server-side error

### Error Response Format
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {
    "field": "Validation error details"
  }
}
```

### Common Error Codes
- `INVALID_INPUT`: Input validation failed
- `UNAUTHORIZED`: Authentication required
- `TOKEN_EXPIRED`: Access token has expired
- `RATE_LIMIT_EXCEEDED`: API rate limit reached
- `FACEBOOK_API_ERROR`: Error from Facebook Graph API
- `DATABASE_ERROR`: Database operation failed

## Authentication

### Bearer Token Format
All MCP tools require Bearer token authentication:

```
Authorization: Bearer <jwt_token>
```

### JWT Token Structure
```json
{
  "userId": "uuid",
  "adAccountId": "act_123456789",
  "iat": 1640995200,
  "exp": 1641081600
}
```

### Token Validation
- Signature verification using JWT_SECRET
- Expiration time validation
- User context extraction for RLS enforcement

## Rate Limits

### Facebook Graph API Limits
- **Ad Account Level**: 200 calls per hour per ad account
- **App Level**: 200 calls per hour per app per user
- **Page Level**: 4800 calls per hour per page

### Bamboo MCP Limits
- **Authentication**: 10 requests per minute per IP
- **MCP Tools**: 60 requests per minute per user
- **Asset Upload**: 5 requests per minute per user

## SDK Integration Examples

### JavaScript/Node.js
```javascript
const response = await fetch('https://yourdomain.com/mcp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'create_campaign',
      arguments: {
        name: 'Test Campaign',
        objective: 'OUTCOME_TRAFFIC',
        adAccountId: 'act_123456789'
      }
    }
  })
});
```

### cURL
```bash
curl -X POST https://yourdomain.com/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get_ad_accounts",
      "arguments": {}
    }
  }'
``` 