# API Reference

## Server Information

- **Name**: Bamboo MCP
- **Version**: 0.1.0
- **MCP SDK**: v1.13.0
- **Server Class**: McpServer
- **Endpoint**: `/` (root)
- **Transport**: StreamableHTTPServerTransport

## Authentication

### OAuth 2.0 Flow

**Authorization URL**: `/authorize`
```
GET /authorize?client_id={id}&redirect_uri={uri}&code_challenge={challenge}&code_challenge_method=S256&state={state}&scope={scopes}
```

**Token Exchange**: `/token`
```
POST /token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&code={code}&client_id={id}&code_verifier={verifier}&redirect_uri={uri}
```

**Token Refresh**: `/token`
```
POST /token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&refresh_token={token}&client_id={id}
```

### JWT Tokens

**Format**: Bearer token in Authorization header
**Expiration**: 86400 seconds (24 hours)
**Algorithm**: HS256

**Payload Structure**:
```json
{
  "userId": "uuid",
  "clientId": "string",
  "adAccountId": "act_123456789",
  "scopes": ["ads_management"],
  "iat": 1640995200,
  "exp": 1641081600,
  "iss": "https://yourdomain.com",
  "aud": "bamboo-mcp-client"
}
```

## Resources

### Prompt Resources

**System Prompt**
```
URI: bamboo://prompts/system
Content-Type: text/plain
Description: System prompt for AI agent
```

**Best Practices**
```
URI: bamboo://prompts/best-practices
Content-Type: text/markdown
Description: Meta Ads best practices guide
```

## Tools

### Account Management

#### get_ad_accounts
List all ad accounts accessible to the user.

**Parameters**: None

**Response**:
```json
{
  "content": [{"type": "text", "text": "..."}],
  "structuredContent": [
    {
      "id": "act_123456789",
      "name": "My Ad Account",
      "account_status": 1,
      "currency": "USD",
      "timezone_name": "America/Los_Angeles",
      "business_name": "My Business"
    }
  ]
}
```

#### select_ad_account
Set default ad account for current session.

**Parameters**:
- `adAccountId` (string, required): Ad account ID (e.g., "act_123456789")

**Response**:
```json
{
  "content": [{"type": "text", "text": "Selected ad account: act_123456789"}]
}
```

### Campaign Management

#### get_campaigns
List campaigns in ad account.

**Parameters**:
- `adAccountId` (string, optional): Ad account ID. Uses selected account if not provided.

**Response**:
```json
{
  "structuredContent": [
    {
      "id": "123456789",
      "name": "My Campaign",
      "objective": "OUTCOME_TRAFFIC",
      "status": "ACTIVE",
      "daily_budget": 1000,
      "created_time": "2025-01-01T00:00:00Z"
    }
  ]
}
```

#### create_campaign
Create new advertising campaign.

**Parameters**:
- `adAccountId` (string, optional): Ad account ID
- `name` (string, required): Campaign name
- `objective` (enum, required): Campaign objective
  - `OUTCOME_TRAFFIC`
  - `OUTCOME_ENGAGEMENT`
  - `OUTCOME_LEADS`
  - `OUTCOME_SALES`
  - `OUTCOME_APP_PROMOTION`
  - `OUTCOME_AWARENESS`
- `status` (enum, optional): Campaign status (default: "PAUSED")
  - `ACTIVE`
  - `PAUSED`
- `dailyBudget` (integer, optional): Daily budget in cents

**Response**:
```json
{
  "structuredContent": {
    "id": "123456789",
    "name": "My Campaign",
    "objective": "OUTCOME_TRAFFIC",
    "status": "PAUSED"
  }
}
```

#### update_campaign
Update existing campaign.

**Parameters**:
- `campaignId` (string, required): Campaign ID
- `name` (string, optional): New campaign name
- `status` (enum, optional): New status
- `dailyBudget` (integer, optional): New daily budget in cents

**Response**: Updated campaign object

#### delete_campaign
Delete campaign.

**Parameters**:
- `campaignId` (string, required): Campaign ID

**Response**:
```json
{
  "content": [{"type": "text", "text": "Campaign deleted successfully"}]
}
```

### Ad Set Management

#### get_adsets
List ad sets.

**Parameters**:
- `adAccountId` (string, optional): Ad account ID
- `campaignId` (string, optional): Campaign ID to filter by

**Response**:
```json
{
  "structuredContent": [
    {
      "id": "123456789",
      "name": "My Ad Set",
      "campaign_id": "987654321",
      "status": "ACTIVE",
      "daily_budget": 500,
      "bid_amount": 100,
      "optimization_goal": "LINK_CLICKS"
    }
  ]
}
```

#### create_adset
Create new ad set.

**Parameters**:
- `campaignId` (string, required): Parent campaign ID
- `name` (string, required): Ad set name
- `status` (enum, optional): Status (default: "PAUSED")
- `dailyBudget` (integer, optional): Daily budget in cents
- `bidAmount` (integer, optional): Bid amount in cents
- `optimizationGoal` (enum, optional): Optimization goal
- `targeting` (object, optional): Targeting options

**Response**: Created ad set object

#### update_adset
Update existing ad set.

**Parameters**:
- `adSetId` (string, required): Ad set ID
- `name` (string, optional): New name
- `status` (enum, optional): New status
- `dailyBudget` (integer, optional): New daily budget
- `bidAmount` (integer, optional): New bid amount

**Response**: Updated ad set object

#### delete_adset
Delete ad set.

**Parameters**:
- `adSetId` (string, required): Ad set ID

**Response**:
```json
{
  "content": [{"type": "text", "text": "Ad set deleted successfully"}]
}
```

## Error Handling

### Error Response Format
```json
{
  "content": [{"type": "text", "text": "Error message"}],
  "isError": true
}
```

### Common Error Types

**Authentication Errors**:
- `MISSING_TOKEN`: Authorization header required
- `INVALID_TOKEN`: JWT token invalid or expired
- `INSUFFICIENT_SCOPE`: Token lacks required permissions

**Account Errors**:
- `NO_ACCOUNT_SELECTED`: Must select ad account first
- `ACCOUNT_NOT_FOUND`: Ad account not accessible
- `ACCOUNT_ACCESS_DENIED`: Insufficient permissions

**Validation Errors**:
- `INVALID_PARAMETERS`: Required parameters missing or invalid
- `INVALID_ENUM_VALUE`: Enum parameter has invalid value

**API Errors**:
- `META_API_ERROR`: Facebook Graph API error
- `RATE_LIMIT_EXCEEDED`: API rate limit reached
- `CIRCUIT_BREAKER_OPEN`: Circuit breaker protecting against failures

## Rate Limits

- **OAuth Endpoints**: Standard rate limiting per IP
- **MCP Tools**: Limited by Meta Graph API quotas
- **Circuit Breaker**: Opens after 5 consecutive failures, resets after 30 seconds

## Health Check

**Endpoint**: `/health`
**Method**: GET

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "version": "0.1.0",
  "database": "connected",
  "mcp": "ready"
}
```

## Data Sanitization

All tool responses automatically sanitize Facebook SDK internal properties:
- Removes properties starting with underscore (`_`)
- Strips `_api` objects containing access tokens
- Prevents sensitive data leakage

## CORS Policy

- **Allowed Origins**: Configurable via environment
- **Allowed Methods**: GET, POST, OPTIONS
- **Allowed Headers**: Content-Type, Authorization
- **Credentials**: Supported 