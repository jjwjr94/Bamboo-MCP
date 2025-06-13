# Meta Ads MCP Analysis

## Repository Structure
- **Language**: Python
- **Main Package**: meta_ads_mcp/
- **Core Module**: meta_ads_mcp/core/

## Core Module Files
- `__init__.py` - Package initialization
- `accounts.py` - Ad account management
- `ads.py` - Ad management functionality
- `ads_library.py` - Ads archive search functionality
- `adsets.py` - Ad set management
- `api.py` - Core API functionality
- `auth.py` - Authentication handling
- `authentication.py` - Enhanced authentication
- `budget_schedules.py` - Budget scheduling
- `callback_server.py` - OAuth callback server
- `campaigns.py` - Campaign management
- `http_auth_integration.py` - HTTP authentication integration
- `insights.py` - Performance insights
- `pipeboard_auth.py` - Pipeboard authentication
- `resources.py` - Resource management

## Key Features Identified
1. **Authentication**: Multiple auth methods (OAuth, Pipeboard)
2. **MCP Tools**: Decorated functions for MCP tool registration
3. **API Integration**: Direct Meta Ads API integration
4. **Callback Server**: OAuth token handling
5. **Resource Management**: MCP resource endpoints

## Tools Available
Based on the README, the MCP provides tools like:
- `mcp_meta_ads_get_ad_accounts`
- `mcp_meta_ads_get_account_info`
- `mcp_meta_ads_get_account_pages`
- `mcp_meta_ads_get_campaigns`
- `mcp_meta_ads_get_campaign_details`
- `mcp_meta_ads_create_campaign`

## Transport Support
- Stdio transport (default)
- HTTP/SSE transport (via STREAMABLE_HTTP_SETUP.md)

