# Meta Ads MCP Server: API Reference

This document provides a comprehensive technical reference for the Meta Ads MCP Server. It is intended for software engineers and technical users who need to integrate with the server to automate Meta advertising workflows. This server exposes a suite of 38 granular, production-grade tools via the Model Context Protocol (MCP).

## 1. Authentication

All tool calls to this server must be authenticated. The server uses an OAuth 2.1 flow with PKCE for secure, user-authorized access. For detailed information about the authentication architecture, see [ARCHITECTURE.md](ARCHITECTURE.md#authentication-flow-oauth-21--pkce) and [SECURITY.md](SECURITY.md#authentication-and-authorization).

The authentication process is as follows:
1.  **Client Registration**: Your MCP client must first be registered with the server. This is typically a one-time setup process.
2.  **Authorization**: The user is redirected to a Meta OAuth dialog to grant your application the necessary permissions (e.g., `ads_management`, `read_insights`).
3.  **Token Exchange**: Upon successful authorization, your client receives an authorization code. This code, along with the PKCE code verifier, is exchanged for an internal JWT access token and a refresh token.
4.  **Authenticated Requests**: All subsequent `tools/call` requests to the MCP server must include the JWT in the `Authorization` header:
    ```
    Authorization: Bearer <your_jwt_access_token>
    ```

The server handles the complexity of managing Meta's access tokens, providing a stable JWT for your client to use. The JWT contains the necessary user context (`userId`, `clientId`, `scopes`) for all subsequent API operations.

## 2. Deletion Safety and Confirmation Patterns

**Important: All destructive operations in this server implement comprehensive safety mechanisms to prevent accidental data loss.**

### 2.1. Mandatory User Prompting

All deletion tools require that **users must be prompted to confirm the permanent deletion before the tool is called**. This is not just a recommendation but a required workflow pattern that should be implemented by all clients:

1. **Detect Deletion Intent**: When an AI agent or user expresses intent to delete a resource, the client must first prompt the user for explicit confirmation.
2. **Present Clear Warning**: The prompt should clearly state that the deletion is permanent and cannot be undone.
3. **Require Explicit Confirmation**: Only proceed with the tool call after receiving explicit user confirmation.
4. **Pass Confirmation Flag**: Set `confirmPermanentDelete: true` in the tool call parameters.

### 2.2. Standardized Confirmation Parameter

All deletion tools use a consistent parameter pattern:

```typescript
{
  // ... other parameters
  confirmPermanentDelete: true  // REQUIRED - Must be exactly `true` (boolean literal)
}
```

**Important:** The `confirmPermanentDelete` parameter must be set to the boolean literal `true`. Other values like `"true"` (string), `1`, or any truthy value will be rejected with a validation error.

### 2.3. Validation and Error Handling

If the confirmation parameter is missing or invalid, the server will respond with a clear, actionable error message:

```json
{
  "isError": true,
  "content": [
    {
      "type": "text",
      "text": "Permanent deletion was not confirmed. Set confirmPermanentDelete to true to proceed."
    }
  ]
}
```

This validation occurs **before** any API calls to Meta, ensuring fast failure and no unintended side effects.

## 3. Tool Categories

The available tools are organized into the following logical categories based on the Meta Ads object model:

*   **Account Management**: Tools for listing and selecting ad accounts.
*   **Campaign Management**: Tools for creating, reading, updating, and deleting campaigns.
*   **Ad Set Management**: Tools for managing ad sets within campaigns, including targeting and budget.
*   **Ad Creative Management**: Tools for managing the visual components of ads, including a secure upload flow.
*   **Ad Management**: Tools for linking creatives and ad sets to create deliverable ads.
*   **Insights & Analytics**: Tools for retrieving performance metrics for accounts, campaigns, ad sets, and ads.
*   **Audience Management**: Tools for managing Custom Audiences.
*   **Page Management**: Tools for interacting with Facebook Pages and their posts.
*   **Business Portfolio Management**: Tools for querying Meta Business Portfolios and associated users.
*   **Ads Archive (Ad Library)**: Tools for searching Meta's public Ad Library for competitive intelligence and transparency.
*   **Targeting**: Tools for discovering and validating available targeting options.

---

## 4. Tool Reference

This section details all 38 available MCP tools.

### Account Management

#### `get_ad_accounts`
Retrieves all Meta ad accounts accessible to the authenticated user, along with their permissions and business context. This is typically the first tool to call to establish context.

*   **Input Parameters**:
    *   `adAccountId` (string, optional): If provided, retrieves details for only that specific ad account.
*   **Successful Output**:
    *   `adAccounts`: An array of ad account objects, each containing:
        *   `id` (string): The ad account ID (e.g., `act_123456789`).
        *   `name` (string): The name of the ad account.
        *   `status` (string): The account status (e.g., `ACTIVE`, `DISABLED`).
        *   `currency` (string): The account's currency code (e.g., `USD`).
        *   `timezone` (string): The account's timezone (e.g., `America/Los_Angeles`).
        *   `businessId` (string | null): The associated Meta Business Portfolio ID, or `null` if it's a personal ad account.
        *   `permissions` (array of strings): The user's permissions for this account (e.g., `ADMIN`, `ADVERTISE`).

#### `select_ad_account`
Sets the active ad account for the current session. Subsequent tool calls that require an `adAccountId` will use this selection by default, simplifying workflows.

*   **Input Parameters**:
    *   `adAccountId` (string, **required**): The ID of the ad account to select for the session.
*   **Successful Output**:
    *   `selectedAccount` (string): The ID of the ad account that was successfully selected.

---

### Campaign Management

#### `get_campaigns`
Retrieves all campaigns for a specific ad account.

*   **Input Parameters**:
    *   `adAccountId` (string, optional): The ad account ID. If not provided, the selected account for the session is used.
*   **Successful Output**:
    *   `campaigns`: An array of campaign objects, matching the structure of the [Meta Marketing API Campaign object](https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group/).

#### `create_campaign`
Creates a new advertising campaign.

*   **Input Parameters**:
    *   `adAccountId` (string, optional): The ad account ID. Defaults to the selected session account.
    *   `name` (string, **required**): The name of the campaign.
    *   `objective` (enum, **required**): The campaign objective. Common values include: `OUTCOME_AWARENESS`, `OUTCOME_TRAFFIC`, `OUTCOME_ENGAGEMENT`, `OUTCOME_LEADS`, `OUTCOME_SALES`, `OUTCOME_APP_PROMOTION`. See `CampaignObjectiveSchema` for all valid values.
    *   `status` (enum, optional, default: `PAUSED`): The initial status. Valid values: `ACTIVE`, `PAUSED`, `ARCHIVED`, `DELETED`.
    *   `dailyBudget` (integer, optional): Daily budget in cents (e.g., 5000 for $50.00). *Either this or `lifetimeBudget` is required.*
    *   `lifetimeBudget` (integer, optional): Lifetime budget in cents. *Either this or `dailyBudget` is required.*
    *   `specialAdCategories` (array of enums, optional, default: `['NONE']`): Required for ads related to credit, employment, housing, etc. See `CampaignSpecialAdCategoriesSchema`.
    *   `specialAdCategoryCountry` (array of strings, optional): An array of 2-letter ISO country codes (e.g., `['US']`). Required if `specialAdCategories` is anything other than `['NONE']`.
*   **Successful Output**:
    *   `campaignId` (string): The ID of the newly created campaign.
    *   `name` (string): The name of the campaign.
    *   `objective` (string): The objective of the campaign.
    *   `status` (string): The status of the campaign.

#### `update_campaign`
Updates an existing campaign's properties.

*   **Input Parameters**:
    *   `campaignId` (string, **required**): The ID of the campaign to update.
    *   `name` (string, optional): New name for the campaign.
    *   `status` (enum, optional): New status for the campaign.
    *   `dailyBudget` (integer, optional): New daily budget in cents.
    *   `lifetimeBudget` (integer, optional): New lifetime budget in cents.
*   **Successful Output**:
    *   `campaignId` (string): The ID of the updated campaign.
    *   `updatedFields` (array of strings): A list of the fields that were updated.

#### `delete_campaign`
**DESTRUCTIVE OPERATION**: Permanently deletes a campaign by setting its status to DELETED. This action cannot be undone. The user must be prompted to confirm this permanent deletion before calling this tool.

*   **Input Parameters**:
    *   `campaignId` (string, **required**): The ID of the campaign to delete.
    *   `confirmPermanentDelete` (boolean literal `true`, **required**): Must be exactly `true` to confirm deletion. See [Deletion Safety](#2-deletion-safety-and-confirmation-patterns) for details.
*   **Successful Output**:
    *   `campaignId` (string): The ID of the deleted campaign.

---

### Ad Set Management

#### `get_adsets`
Retrieves ad sets for a campaign or an entire ad account.

*   **Input Parameters**:
    *   `campaignId` (string, optional): If provided, returns ad sets only for this campaign.
    *   `adAccountId` (string, optional): The ad account ID. Defaults to the selected session account.
*   **Successful Output**:
    *   `adSets`: An array of ad set objects, matching the [Meta Marketing API AdSet object](https://developers.facebook.com/docs/marketing-api/reference/ad-set/).

#### `create_adset`
Creates a new ad set within a campaign.

*   **Input Parameters**:
    *   `campaignId` (string, **required**): The campaign to create the ad set in.
    *   `name` (string, **required**): The name for the new ad set.
    *   `dailyBudget` / `lifetimeBudget` (integer, optional): Budget in cents. *One is required.*
    *   `targeting` (object, **required**): A complex object defining the target audience. Must include `geoLocations`.
        *   `geoLocations`: `{ countries: string[], regions: object[], cities: object[] }`
        *   See `src/types/meta.ts` for the full `MetaTargeting` interface.
    *   `billingEvent` (enum, **required**): Event to bill for (e.g., `IMPRESSIONS`).
    *   `optimizationGoal` (enum, **required**): Goal to optimize delivery for (e.g., `REACH`, `LINK_CLICKS`).
    *   `bidStrategy` (enum, optional, default: `LOWEST_COST_WITHOUT_CAP`): Bidding strategy.
    *   `startTime` / `endTime` (string, optional): ISO 8601 formatted date strings.
    *   `status` (enum, optional, default: `PAUSED`): Initial status.
    *   `attributionSpec` (array, optional): Modern attribution spec for iOS 14.5+. E.g., `[{ "event_type": "CLICK_THROUGH", "window_days": 7 }]`.
    *   `isSacCfcaTermsCertified` (boolean, optional): Required for Special Ad Category campaigns targeting California with a `CONVERSIONS` goal.
*   **Successful Output**:
    *   `adSetId` (string): The ID of the newly created ad set.
    *   `name` (string): The name of the ad set.
    *   `campaignId` (string): The ID of the parent campaign.
    *   `status` (string): The initial status of the ad set.

#### `update_adset`
Updates an existing ad set.

*   **Input Parameters**:
    *   `adSetId` (string, **required**): The ID of the ad set to update.
    *   `name` (string, optional): New name.
    *   `status` (enum, optional): New status.
    *   `dailyBudget` / `lifetimeBudget` / `bidAmount` (integer, optional): New budget or bid values in cents.
*   **Successful Output**:
    *   `adSetId` (string): The ID of the updated ad set.
    *   `updatedFields` (array of strings): A list of the fields that were updated.

#### `delete_adset`
**DESTRUCTIVE OPERATION**: Permanently deletes an ad set. This action cannot be undone. The user must be prompted to confirm this permanent deletion before calling this tool.

*   **Input Parameters**:
    *   `adSetId` (string, **required**): The ID of the ad set to delete.
    *   `confirmPermanentDelete` (boolean literal `true`, **required**): Must be exactly `true` to confirm deletion. See [Deletion Safety](#2-deletion-safety-and-confirmation-patterns) for details.
*   **Successful Output**:
    *   `adSetId` (string): The ID of the deleted ad set.

---

### Ad Creative Management

This category includes a secure, two-step workflow for uploading creative assets (images/videos) because the MCP protocol does not support direct file transfers.

**Workflow**:
1.  Call `request_creative_upload` to get a unique, single-use URL.
2.  Provide this URL to the end-user, who uploads the file via a standard web form.
3.  Periodically call `check_upload_status` with the `uploadId` until the status is `completed`.
4.  Use the `metaAssetId` returned by `check_upload_status` in the `create_ad_creative` tool.

#### `get_ad_creatives`
Retrieves all ad creatives for an ad account.

*   **Input Parameters**:
    *   `adAccountId` (string, optional): The ad account ID. Defaults to the selected session account.
*   **Successful Output**:
    *   `adCreatives`: An array of ad creative objects from the Meta API.

#### `request_creative_upload`
Initiates the secure file upload process.

*   **Input Parameters**:
    *   `adAccountId` (string, optional): The ad account where the asset will be used. Defaults to the selected session account.
*   **Successful Output**:
    *   `uploadId` (string): A unique UUID for this upload session. Use this ID to check the status.
    *   `uploadUrl` (string): A secure, single-use URL to provide to the end-user for uploading the file.

#### `check_upload_status`
Checks the status of a file upload.

*   **Input Parameters**:
    *   `uploadId` (string, **required**): The ID returned from `request_creative_upload`.
*   **Successful Output**:
    *   `status` (enum): The current status: `pending`, `uploading`, `completed`, or `failed`.
    *   `metaAssetId` (string, optional): The Meta asset ID (image hash or video ID). Available only when status is `completed`.
    *   `errorMessage` (string, optional): Details of the error if status is `failed`.

#### `create_ad_creative`
Creates a new ad creative using a previously uploaded asset.

*   **Input Parameters**:
    *   `adAccountId` (string, optional): The ad account ID.
    *   `name` (string, **required**): Name for the ad creative.
    *   `objectStorySpec` (object, **required**): Specification for the creative.
        *   `pageId` (string, **required**): The Facebook Page ID to associate with the creative.
        *   `linkData` (object, optional): For image/link ads. Must include `link` and `imageHash` (from `metaAssetId`).
        *   `videoData` (object, optional): For video ads. Must include `videoId` (from `metaAssetId`).
*   **Successful Output**:
    *   `adCreativeId` (string): The ID of the newly created ad creative.
    *   `name` (string): The name of the creative.

#### `update_ad_creative`
Updates an existing ad creative's name.

*   **Input Parameters**:
    *   `adCreativeId` (string, **required**): The ID of the creative to update.
    *   `name` (string, **required**): The new name for the creative.
*   **Successful Output**:
    *   `adCreativeId` (string): The ID of the updated creative.
    *   `updatedFields` (array of strings): Will contain `['name']`.

#### `delete_ad_creative`
**DESTRUCTIVE OPERATION**: Permanently deletes an ad creative. This action cannot be undone. The user must be prompted to confirm this permanent deletion before calling this tool.

*   **Input Parameters**:
    *   `adCreativeId` (string, **required**): The ID of the creative to delete.
    *   `confirmPermanentDelete` (boolean literal `true`, **required**): Must be exactly `true` to confirm deletion. See [Deletion Safety](#2-deletion-safety-and-confirmation-patterns) for details.
*   **Successful Output**:
    *   `adCreativeId` (string): The ID of the deleted creative.

---

### Ad Management

#### `get_ads`
Retrieves ads for a specific ad account, campaign, or ad set.

*   **Input Parameters**:
    *   `adAccountId` (string, optional): The ad account ID.
    *   `campaignId` (string, optional): Filter ads by campaign ID.
    *   `adSetId` (string, optional): Filter ads by ad set ID.
*   **Successful Output**:
    *   `ads`: An array of ad objects from the Meta API.

#### `create_ad`
Creates a new ad by linking an ad creative to an ad set.

*   **Input Parameters**:
    *   `adAccountId` (string, optional): The ad account ID.
    *   `adsetId` (string, **required**): The ID of the ad set for this ad.
    *   `name` (string, **required**): The name for the new ad.
    *   `creativeId` (string, **required**): The ID of the ad creative to use.
    *   `status` (enum, optional, default: `PAUSED`): The initial status of the ad.
*   **Successful Output**:
    *   `adId` (string): The ID of the newly created ad.
    *   `name` (string): The name of the ad.
    *   `adsetId` (string): The ad set ID.
    *   `creativeId` (string): The creative ID.
    *   `status` (string): The ad's status.

#### `update_ad`
Updates an existing ad.

*   **Input Parameters**:
    *   `adId` (string, **required**): The ID of the ad to update.
    *   `name` (string, optional): New name for the ad.
    *   `status` (enum, optional): New status for the ad.
    *   `creativeId` (string, optional): A new creative ID to associate with the ad.
*   **Successful Output**:
    *   `adId` (string): The ID of the updated ad.
    *   `updatedFields` (array of strings): A list of the fields that were updated.

#### `delete_ad`
**DESTRUCTIVE OPERATION**: Permanently deletes an ad. This action cannot be undone. The user must be prompted to confirm this permanent deletion before calling this tool.

*   **Input Parameters**:
    *   `adId` (string, **required**): The ID of the ad to delete.
    *   `confirmPermanentDelete` (boolean literal `true`, **required**): Must be exactly `true` to confirm deletion. See [Deletion Safety](#2-deletion-safety-and-confirmation-patterns) for details.
*   **Successful Output**:
    *   `adId` (string): The ID of the deleted ad.

---

### Insights & Analytics

#### `get_ad_insights`
Retrieves performance metrics for a specific campaign, ad set, or ad.

*   **Input Parameters**:
    *   `campaignId` / `adSetId` / `adId` (string, optional): *At least one is required.* The ID of the entity to get insights for.
    *   `datePreset` (enum, optional): A predefined date range (e.g., `last_30d`).
    *   `timeRange` (object, optional): A custom date range with `since` and `until` properties in `YYYY-MM-DD` format. *Use either this or `datePreset`.*
    *   `metrics` (array of enums, optional): A list of metrics to retrieve (e.g., `spend`, `impressions`, `clicks`). Defaults to a core set.
    *   `breakdowns` (array of enums, optional): Dimensions to break down the data by (e.g., `age`, `gender`, `placement`).
*   **Successful Output**:
    *   `insights`: An array of insight data objects from the Meta API.

#### `get_ad_account_insights`
Retrieves aggregated performance metrics for an entire ad account.

*   **Input Parameters**:
    *   `adAccountId` (string, optional): The ad account ID.
    *   *Other parameters are the same as `get_ad_insights`.*
*   **Successful Output**:
    *   `insights`: An array of insight data objects from the Meta API.

---

### Audience Management

#### `get_custom_audiences`
Retrieves all custom audiences for an ad account.

*   **Input Parameters**:
    *   `adAccountId` (string, optional): The ad account ID.
*   **Successful Output**:
    *   `customAudiences`: An array of custom audience objects from the Meta API.

#### `create_custom_audience`
Creates a new custom audience for list-based retargeting.

*   **Input Parameters**:
    *   `adAccountId` (string, optional): The ad account ID.
    *   `name` (string, **required**): A name for the audience.
    *   `subtype` (enum, **required**): Must be `'CUSTOM'` for list-based audiences.
    *   `description` (string, optional): A description for the audience.
*   **Successful Output**:
    *   `id` (string): The ID of the newly created custom audience.

#### `delete_custom_audience`
**DESTRUCTIVE OPERATION**: Permanently deletes a custom audience by its ID. This action cannot be undone. The user must be prompted to confirm this permanent deletion before calling this tool.

*   **Input Parameters**:
    *   `customAudienceId` (string, **required**): The ID of the audience to delete.
    *   `confirmPermanentDelete` (boolean literal `true`, **required**): Must be exactly `true` to confirm deletion. See [Deletion Safety](#2-deletion-safety-and-confirmation-patterns) for details.
*   **Successful Output**:
    *   `success` (boolean): `true` if the deletion was successful.

---

### Page Management

#### `get_pages`
Retrieves a list of Facebook Pages the user has access to.

*   **Input Parameters**: None.
*   **Successful Output**:
    *   `pages`: An array of page objects, each containing `id`, `name`, `category`, etc.

#### `get_page_posts`
Retrieves recent posts for a specific Facebook Page.

*   **Input Parameters**:
    *   `pageId` (string, **required**): The ID of the Facebook Page.
*   **Successful Output**:
    *   `posts`: An array of page post objects from the Meta API.

#### `create_page_post_ad`
Creates a new ad by promoting an existing Facebook Page post.

*   **Input Parameters**:
    *   `adAccountId` (string, optional): The ad account ID.
    *   `name` (string, **required**): A name for the new ad.
    *   `adSetId` (string, **required**): The ad set to place the new ad in.
    *   `postId` (string, **required**): The ID of the page post in the format `pageId_postId` (e.g., `12345_67890`).
    *   `status` (enum, optional): `ACTIVE` or `PAUSED`.
*   **Successful Output**:
    *   `adId` (string): The ID of the newly created ad.
    *   `adCreativeId` (string): The ID of the creative generated from the post.

---

### Business Portfolio Management

#### `get_business_accounts`
Lists business manager accounts (Meta Business Portfolios) the user has access to.

*   **Input Parameters**: None.
*   **Successful Output**:
    *   `businesses`: An array of business account objects.

#### `get_business_users`
Lists users associated with a specific business manager.

*   **Input Parameters**:
    *   `businessId` (string, **required**): The ID of the business to get users for.
*   **Successful Output**:
    *   `users`: An array of user objects associated with the business.
    *   `businessId` (string): The ID of the business that was queried.

---

### Ads Archive (Ad Library)

#### `search_ads_archive`
Searches the Meta Ads Archive (Ad Library) for public archived ads.

*   **Input Parameters**:
    *   `searchTerms` (string, optional): Keywords to search for.
    *   `searchPageIds` (array of strings, optional): Filter by up to 10 Facebook Page IDs.
    *   `adReachedCountries` (array of strings, **required**, default: `['US']`): 2-letter ISO country codes.
    *   `limit` (integer, optional, default: 250): Maximum number of results.
*   **Successful Output**:
    *   `ads`: An array of archived ad objects.

#### `get_political_ads`
Searches specifically for political and social issue ads, which include enhanced transparency data.

*   **Input Parameters**: Same as `search_ads_archive`.
*   **Successful Output**:
    *   `political_ads`: An array of political ad objects with additional data like `funding_entity`.

#### `get_page_archive_ads`
Searches archived ads from one or more specific Facebook Pages.

*   **Input Parameters**:
    *   `pageIds` (array of strings, **required**): 1-10 Facebook Page IDs.
    *   *Other parameters are the same as `search_ads_archive`.*
*   **Successful Output**:
    *   `page_ads`: An array of archived ad objects from the specified pages.

#### `get_ads_archive_insights`
Performs an advanced search for archived ads with enhanced demographic and regional data.

*   **Input Parameters**:
    *   `includeRegionalData` (boolean, optional): If `true`, includes regional distribution data.
    *   `includeDemographicData` (boolean, optional): If `true`, includes demographic distribution data.
    *   *Other parameters are the same as `search_ads_archive`.*
*   **Successful Output**:
    *   `ads_insights`: An array of ad objects with enhanced insight data.

---

### Targeting

#### `search_interests`
Searches for advertising interests available for targeting.

*   **Input Parameters**:
    *   `query` (string, **required**): The keyword to search for (e.g., "sports").
    *   `limit` (integer, optional, default: 100): Maximum number of results.
*   **Successful Output**:
    *   `interests`: An array of interest objects, each with `id`, `name`, `audienceSize`, and `path`.

#### `search_behaviors`
Searches for advertising behaviors available for targeting.

*   **Input Parameters**:
    *   `query` (string, **required**): The keyword to search for (e.g., "engaged shoppers").
    *   `limit` (integer, optional, default: 25): Maximum number of results.
*   **Successful Output**:
    *   `behaviors`: An array of behavior objects.

#### `search_locations`
Searches for geographic locations (countries, regions, cities) for targeting.

*   **Input Parameters**:
    *   `query` (string, **required**): The location name to search for (e.g., "California").
    *   `limit` (integer, optional, default: 25): Maximum number of results.
*   **Successful Output**:
    *   `locations`: An array of location objects, each with `key`, `name`, `type`, and `countryCode`.

#### `validate_targeting_options`
Checks if a list of targeting option IDs (from interests, behaviors, etc.) are still valid for use.

*   **Input Parameters**:
    *   `targetingOptionIds` (array of strings, **required**): A list of IDs to validate.
*   **Successful Output**:
    *   `validationResults`: An array of objects, each with `id`, `name`, `isValid`, and `status`.

---

## 5. Error Handling

The server returns structured errors to provide clear guidance for clients. All errors, whether from the Meta API or internal validation, are standardized into the following format.

**Error Response Structure**:
```json
{
  "result": {
    "type": "error",
    "message": "A human-readable error message.",
    "error": {
      "retryable": false,
      "errorCode": "VALIDATION_ERROR",
      "category": "validation"
    }
  }
}
```

**Error Categories**:

| Category | Description | Retryable? |
| :--- | :--- | :--- |
| `authentication` | The access token (JWT) is invalid, expired, or missing. The user must re-authenticate. | No |
| `authorization` | The user does not have permission to perform the requested action on the specified Meta object. | No |
| `validation` | The input parameters for the tool are invalid (e.g., missing a required field, wrong format). | No |
| `rate_limit` | The Meta API rate limit has been exceeded. | Yes |
| `api_error` | A general, non-transient error returned by the Meta API. | No |
| `internal` | An unexpected server-side error occurred. Includes transient issues like network timeouts. | Sometimes |

## 6. Rate Limiting and Resilience

The server is designed with resilience to handle transient failures from the Meta API.
*   **Retries with Exponential Backoff**: The server will automatically retry API calls that fail due to temporary issues (like server-side errors or timeouts) with an increasing delay between attempts.
*   **Circuit Breaker**: After a configured number of consecutive failures, the server will "open the circuit" and fail fast for a short period to avoid overwhelming the Meta API. This allows the external service time to recover.

These policies are applied per-request to ensure that an issue affecting one user does not impact the availability of the service for others. Clients should inspect the `retryable` flag in error responses to implement their own appropriate retry logic.

For more details on resilience patterns and security measures, see [ARCHITECTURE.md](ARCHITECTURE.md#resilience-patterns) and [SECURITY.md](SECURITY.md#api-and-application-security).
