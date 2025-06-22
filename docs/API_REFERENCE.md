# Meta Ads MCP Server API Reference

This document provides comprehensive reference documentation for all 28 tools available in the Meta Ads MCP server. The server provides secure, production-ready access to Meta's Marketing API through the Model Context Protocol.

## Overview

The Meta Ads MCP server implements 28 tools across 5 core categories:
- **Ad Account Management** (1 tool)
- **Campaign Management** (4 tools) 
- **Ad Set Management** (4 tools)
- **Ad Management** (4 tools)
- **Ad Creative Management** (4 tools)
- **Insights & Analytics** (2 tools)
- **Custom Audience Management** (3 tools)
- **Pages Management** (3 tools)
- **Business Manager** (2 tools)

All tools implement enterprise-grade features including:
- **Pagination Safety**: Automatic limits prevent resource exhaustion
- **Business Context**: Seamless handling of business-managed accounts
- **Delete Protection**: Confirmation flags for destructive operations
- **Schema Validation**: Comprehensive input/output validation
- **Error Resilience**: Circuit breakers and intelligent retry logic

## Authentication

All tools require valid OAuth 2.1 authentication with appropriate Meta permissions. The server handles token management, refresh rotation, and security automatically.

## Ad Account Management

### get_ad_accounts

Retrieves all Meta ad accounts accessible to the authenticated user.

**Input Parameters:**
- None required

**Output:**
```json
{
  "accounts": [
    {
      "id": "act_123456789",
      "name": "My Ad Account",
      "status": "ACTIVE",
      "currency": "USD",
      "timezone": "America/New_York",
      "businessId": "business_123",
      "permissions": ["MANAGE", "ADVERTISE"]
    }
  ]
}
```

**Features:**
- Automatic pagination with safety limits (max 100 accounts)
- Business context detection and storage
- Permission validation and caching
- Real-time sync with Meta API

## Campaign Management

### get_campaigns

Retrieves campaigns for a specified ad account with comprehensive pagination.

**Input Parameters:**
- `adAccountId` (optional): Target ad account ID

**Output:**
```json
{
  "campaigns": [
    {
      "id": "campaign_123",
      "name": "Summer Sale Campaign",
      "status": "ACTIVE",
      "objective": "CONVERSIONS",
      "daily_budget": "5000",
      "lifetime_budget": null,
      "created_time": "2024-01-15T10:30:00Z"
    }
  ]
}
```

**Features:**
- Pagination safety (max 1000 campaigns)
- Business context handling for enterprise accounts
- Comprehensive field coverage
- Status filtering support

### create_campaign

Creates a new advertising campaign with full validation.

**Input Parameters:**
- `adAccountId` (optional): Target ad account
- `name` (required): Campaign name
- `objective` (required): Campaign objective (CONVERSIONS, TRAFFIC, etc.)
- `buying_type` (optional): The buying type for the campaign. Defaults to 'AUCTION'.
- `status` (optional): Initial status (default: PAUSED)
- `dailyBudget` (optional): Daily budget in cents. **Must provide either this or `lifetimeBudget`.**
- `lifetimeBudget` (optional): Lifetime budget in cents. **Must provide either this or `dailyBudget`.**
- `specialAdCategories` (optional): Special category compliance. Defaults to ['NONE']. If set to values other than 'NONE', `specialAdCategoryCountry` is required.
- `specialAdCategoryCountry` (optional): Required when `specialAdCategories` contains values other than 'NONE'. Array of 2-letter ISO country codes.

**Output:**
```json
{
  "success": true,
  "campaignId": "campaign_123",
  "name": "Summer Sale Campaign",
  "message": "Campaign created successfully"
}
```

### update_campaign

Updates an existing campaign with selective field modification.

**Input Parameters:**
- `campaignId` (required): Campaign to update
- `name` (optional): New campaign name
- `status` (optional): New status
- `dailyBudget` (optional): New daily budget
- `lifetimeBudget` (optional): New lifetime budget

### delete_campaign

Archives a campaign by setting status to DELETED. Campaign data is preserved.

**Input Parameters:**
- `campaignId` (required): Campaign to archive

**Note:** This performs a soft delete (archival) and does not require confirmation.

## Ad Set Management

### get_adsets

Retrieves ad sets with flexible filtering and comprehensive pagination.

**Input Parameters:**
- `adAccountId` (optional): Filter by ad account
- `campaignId` (optional): Filter by campaign

**Features:**
- Pagination safety (max 1000 ad sets)
- Multi-level filtering (account and campaign)
- Business context support
- Complete targeting information

### create_adset

Creates a new ad set with advanced targeting options.

**Input Parameters:**
- `adAccountId` (optional): Target ad account
- `campaignId` (required): Parent campaign
- `name` (required): Ad set name
- `status` (optional): Initial status (default: PAUSED)
- `dailyBudget` (optional): Daily budget in cents. **Must provide either this or `lifetimeBudget`.**
- `lifetimeBudget` (optional): Lifetime budget in cents. **Must provide either this or `dailyBudget`.**
- `bidStrategy` (optional): The bid strategy. Options include `LOWEST_COST_WITHOUT_CAP`, `LOWEST_COST_WITH_BID_CAP`, `COST_CAP`, etc. Defaults to `LOWEST_COST_WITHOUT_CAP`.
- `bidAmount` (optional): Bid amount in cents, required for certain bid strategies like `LOWEST_COST_WITH_BID_CAP` and `COST_CAP`.
- `targeting` (required): Targeting specification.
  - `geoLocations` (required): Geographic targeting including countries, regions, or cities. **Must specify at least one.** Country codes must be 2-letter ISO 3166-1 alpha-2 format (e.g., 'US', 'CA').
- `billingEvent` (required): Billing event for the ad set
- `optimizationGoal` (required): Optimization goal for the ad set
- `startTime` (optional): Start time in ISO format
- `endTime` (optional): End time in ISO format
- `attributionSpec` (optional): Modern attribution spec for iOS 14.5+ compliance. Must be an array of objects, e.g., `[{ "event_type": "CLICK_THROUGH", "window_days": 7 }]`. Valid window_days are 1 or 7.
- `promotedObject` (optional): Required for certain campaign objectives like Page Likes, App Installs, Product Catalog Sales
- `isSacCfcaTermsCertified` (optional): Certifies CCPA compliance for Special Ad Category campaigns targeting California with CONVERSIONS optimization goal

### update_adset

Updates ad set configuration including targeting and budget.

### delete_adset

Archives an ad set by setting status to DELETED. Ad set data is preserved.

## Ad Management

### get_ads

Retrieves ads with multi-level filtering capabilities.

**Input Parameters:**
- `adAccountId` (optional): Filter by ad account
- `adSetId` (optional): Filter by ad set
- `campaignId` (optional): Filter by campaign

**Features:**
- Pagination safety (max 1000 ads)
- Hierarchical filtering
- Business context integration
- Complete ad metadata

### create_ad

Creates a new ad linking creative and ad set.

**Input Parameters:**
- `adAccountId` (optional): Target ad account
- `name` (required): Ad name
- `adSetId` (required): Parent ad set
- `creativeId` (required): Ad creative to use
- `status` (optional): Initial status
- `creative_features_spec` (optional): Specification for Advantage+ creative features. Required in Meta API v22 if using any Advantage+ features. Individual features must be explicitly opted into.

### update_ad

Updates ad configuration and creative assignment.

### delete_ad

**⚠️ DESTRUCTIVE OPERATION**

Permanently deletes an ad. This action cannot be undone.

**Input Parameters:**
- `adId` (required): Ad to delete
- `confirmPermanentDelete` (required): Must be `true` to confirm

**Safety Features:**
- Explicit confirmation required
- Validation prevents accidental deletion
- Comprehensive error handling

## Ad Creative Management

### get_ad_creatives

Retrieves ad creatives with comprehensive metadata.

**Features:**
- Pagination safety (max 1000 creatives)
- Business context support
- Rich creative metadata
- Provides URLs for creative thumbnails and previews (note: image data is not embedded)

### create_ad_creative

Creates new ad creative with flexible content options.

**Input Parameters:**
- `adAccountId` (optional): Target ad account
- `name` (required): Creative name
- `objectStorySpec` (required): Creative content specification. Must include either linkData for link ads or videoData for video ads.

### update_ad_creative

Updates creative properties and metadata.

### delete_ad_creative

**⚠️ DESTRUCTIVE OPERATION**

Permanently deletes an ad creative. This action cannot be undone.

**Input Parameters:**
- `adCreativeId` (required): Creative to delete
- `confirmPermanentDelete` (required): Must be `true` to confirm

## Insights & Analytics

### get_ad_insights

Retrieves detailed performance insights for ads, ad sets, or campaigns.

**Input Parameters:**
- `campaignId` (optional): Campaign-level insights
- `adSetId` (optional): Ad set-level insights  
- `adId` (optional): Ad-level insights
- `metrics` (required): Performance metrics to retrieve
- `breakdowns` (optional): Data breakdown dimensions
- `datePreset` (optional): Predefined date range
- `timeRange` (optional): Custom date range
- `limit` (optional): Results per page

**Features:**
- Pagination safety (max 10,000 insights)
- Flexible metric selection
- Multiple breakdown options
- Custom date range support

### get_ad_account_insights

Retrieves account-level performance insights and aggregated metrics.

## Custom Audience Management

### get_custom_audiences

Retrieves custom audiences with metadata and size estimates.

**Features:**
- Pagination safety (max 1000 audiences)
- Size approximations
- Retention information
- Source tracking

### create_custom_audience

Creates new custom audience for targeted advertising.

**Input Parameters:**
- `adAccountId` (optional): Target ad account
- `name` (required): Audience name
- `subtype` (required): Audience type
- `description` (optional): Audience description
- `customerFileSource` (optional): Data source

### delete_custom_audience

**⚠️ DESTRUCTIVE OPERATION**

Permanently deletes a custom audience. This action cannot be undone.

**Input Parameters:**
- `customAudienceId` (required): Audience to delete
- `confirmPermanentDelete` (required): Must be `true` to confirm

## Pages Management

### get_pages

Retrieves Facebook Pages accessible to the authenticated user.

**Features:**
- Pagination safety (max 100 pages)
- Complete page metadata
- Permission information
- Verification status

**Output:**
```json
{
  "pages": [
    {
      "id": "page_123456789",
      "name": "My Facebook Page",
      "category": "Community",
      "link": "https://www.facebook.com/my-page",
      "about": "This is a description of my page."
    }
  ]
}
```

### get_page_posts

Retrieves posts from a specific Facebook Page.

**Input Parameters:**
- `pageId` (required): Target page ID

**Features:**
- Pagination safety (max 1000 posts)
- Post metadata and engagement
- Media attachment information

### create_page_post_ad

Creates an ad using an existing page post as creative.

**Input Parameters:**
- `adAccountId` (optional): Target ad account
- `name` (required): Ad name
- `adSetId` (required): Parent ad set
- `postId` (required): Page post to promote
- `status` (optional): Initial status

## Business Manager

### get_business_accounts

Retrieves business accounts owned by the authenticated user.

**Features:**
- Pagination safety (max 100 businesses)
- Verification status
- Business metadata
- Timezone information

### get_business_users

Retrieves users associated with a specific business account.

**Input Parameters:**
- `businessId` (required): Target business ID

**Features:**
- Pagination safety (max 1000 users)
- Role and permission information
- Contact details
- Security status (2FA, etc.)

## Error Handling

All tools implement comprehensive error handling with structured responses:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid parameter: adAccountId is required",
    "retryable": false,
    "details": {
      "field": "adAccountId",
      "constraint": "required"
    }
  }
}
```

**Error Types:**
- `VALIDATION_ERROR`: Invalid input parameters
- `AUTHENTICATION_ERROR`: Auth token issues
- `AUTHORIZATION_ERROR`: Insufficient permissions
- `RATE_LIMIT_ERROR`: API rate limiting (retryable)
- `META_API_ERROR`: Meta API failures
- `INTERNAL_ERROR`: Server-side issues

## Rate Limiting & Resilience

The server implements sophisticated resilience patterns:

- **Circuit Breakers**: Automatic failure detection and recovery
- **Exponential Backoff**: Intelligent retry timing
- **Request Isolation**: Per-user resilience policies
- **Error Classification**: Smart retry decisions
- **Resource Protection**: Pagination safety limits

## Security Features

- **OAuth 2.1 + PKCE**: Modern authentication standard
- **JWT with EdDSA**: Cryptographically secure tokens
- **Refresh Token Rotation**: Enhanced security
- **Row-Level Security**: Database-level isolation
- **Business Context Validation**: Secure multi-tenant access
- **Input Sanitization**: Comprehensive validation
- **Output Sanitization**: Sensitive data protection

## Performance Optimizations

- **Pagination Limits**: Prevent resource exhaustion
- **Efficient Queries**: Optimized database access
- **Connection Pooling**: Database performance
- **Request Caching**: Reduced API calls
- **Batch Operations**: Efficient bulk processing
- **Memory Management**: Controlled resource usage 