# Meta Ads MCP Reporting Tools - Complete Reference

## Overview

The Bamboo MCP Gateway provides comprehensive Meta Ads reporting capabilities through enhanced insights tools. This document covers all available features, parameters, and usage examples.

## Available Tools

### 1. `get_ad_insights` - Comprehensive Ad Insights Report
**Purpose**: Retrieves performance metrics for campaigns, ad sets, or ads with advanced filtering, sorting, breakdowns, and export capabilities.

### 2. `get_ad_account_insights` - Account-Level Insights Report  
**Purpose**: Retrieves aggregated performance metrics for an entire ad account with the same advanced features.

## Tool Parameters

### Core Parameters

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `campaignId` | string | No* | Campaign ID to get insights for | `"123456789"` |
| `adSetId` | string | No* | Ad set ID to get insights for | `"987654321"` |
| `adId` | string | No* | Ad ID to get insights for | `"456789123"` |
| `adAccountId` | string | No* | Ad account ID (for account insights) | `"act_123456789"` |

*At least one of `campaignId`, `adSetId`, `adId`, or `adAccountId` must be provided.

### Metrics Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `metrics` | array | No | `["spend", "impressions", "clicks", "ctr", "cpc", "reach", "frequency"]` | List of metrics to retrieve |
| `level` | string | No | `"ad"` or `"account"` | Aggregation level: `"account"`, `"campaign"`, `"adset"`, `"ad"` |

### Time Range Parameters

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `datePreset` | string | No | Predefined date range | `"last_7d"`, `"last_30d"`, `"this_year"` |
| `timeRange` | object | No | Custom date range | `{"since": "2024-01-01", "until": "2024-01-31"}` |

**Note**: Use either `datePreset` OR `timeRange`, not both.

### Advanced Parameters

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `breakdowns` | array | No | Breakdown dimensions | `["age", "gender", "country"]` |
| `limit` | number | No | 250 | Maximum results (max: 1000) | `1000` |
| `sort` | string | No | Sort by metric | `"spend_descending"`, `"ctr_ascending"` |
| `filtering` | array | No | Filter criteria | See filtering section below |
| `exportFormat` | string | No | Export format | `"json"`, `"csv"`, `"excel"` |

## Available Metrics (23 total)

### Standard Performance Metrics
- `spend` - Total amount spent
- `impressions` - Number of times ads were shown
- `clicks` - Number of clicks on ads
- `ctr` - Click-through rate (clicks/impressions)
- `cpc` - Cost per click
- `cpm` - Cost per 1,000 impressions
- `reach` - Number of unique people reached
- `frequency` - Average number of times each person saw the ad

### Conversion Metrics
- `conversions` - Number of conversions
- `cost_per_conversion` - Cost per conversion (CPA)

### Advanced Click Metrics
- `actions` - All actions taken on ads
- `inline_link_clicks` - Clicks on links within ads
- `outbound_clicks` - Clicks that take users off Meta platforms
- `unique_clicks` - Number of unique people who clicked
- `unique_ctr` - Unique click-through rate

### Cost Metrics
- `cost_per_inline_link_click` - Cost per inline link click
- `cost_per_unique_click` - Cost per unique click

### Video Engagement Metrics
- `video_30_sec_watched_actions` - 30-second video views
- `video_p100_watched_actions` - 100% video completion
- `video_p25_watched_actions` - 25% video completion
- `video_p50_watched_actions` - 50% video completion
- `video_p75_watched_actions` - 75% video completion
- `video_thruplay_watched_actions` - ThruPlay video views

## Available Breakdowns

### Demographics
- `age` - Age groups
- `gender` - Gender breakdown
- `country` - Country breakdown
- `region` - Regional breakdown
- `city` - City breakdown

### Placements & Devices
- `device_platform` - Device type (mobile, desktop)
- `publisher_platform` - Platform (facebook, instagram, messenger, audience_network)
- `placement` - Ad placement
- `impression_device` - Device that showed the ad

### Time-based
- `hour` - Hour of day
- `day` - Day of week
- `week` - Week breakdown
- `month` - Month breakdown
- `hourly_stats_aggregated_by_advertiser_time_zone` - Hourly stats by advertiser timezone
- `hourly_stats_aggregated_by_audience_time_zone` - Hourly stats by audience timezone

### Campaign/Ad Structure
- `campaign_id` - Campaign breakdown
- `adset_id` - Ad set breakdown
- `ad_id` - Ad breakdown
- `breakdown_ad_objective` - Ad objective breakdown
- `breakdown_reporting_ad_id` - Reporting ad ID breakdown

### Actions & Conversions
- `action_type` - Type of action taken
- `action_device` - Device where action occurred
- `action_destination` - Where the action led
- `conversion_destination` - Where conversions occurred
- `coarse_conversion_value` - Conversion value ranges

### Advanced Breakdowns
- `frequency_value` - Frequency bucket
- `app_id` - App ID breakdown
- `product_id` - Product ID breakdown
- `place_page_id` - Place page ID breakdown
- `media_type` - Media type breakdown
- `media_format` - Media format breakdown
- `media_creator` - Media creator breakdown
- `media_origin_url` - Media origin URL breakdown
- `media_destination_url` - Media destination URL breakdown
- `media_asset_url` - Media asset URL breakdown
- `media_text_content` - Media text content breakdown
- `video_asset` - Video asset breakdown
- `image_asset` - Image asset breakdown
- `body_asset` - Body asset breakdown
- `title_asset` - Title asset breakdown
- `description_asset` - Description asset breakdown
- `call_to_action_asset` - Call to action asset breakdown
- `link_url_asset` - Link URL asset breakdown
- `ad_format_asset` - Ad format asset breakdown
- `landing_destination` - Landing destination breakdown
- `mdsa_landing_destination` - MDSA landing destination breakdown
- `marketing_messages_btn_name` - Marketing messages button name breakdown
- `user_persona_id` - User persona ID breakdown
- `user_persona_name` - User persona name breakdown
- `dma` - Designated Market Area breakdown
- `fidelity_type` - Fidelity type breakdown
- `hsid` - HSID breakdown
- `mmm` - MMM breakdown
- `platform_position` - Platform position breakdown
- `postback_sequence_index` - Postback sequence index breakdown
- `redownload` - Redownload breakdown
- `signal_source_bucket` - Signal source bucket breakdown
- `skan_campaign_id` - SKAN campaign ID breakdown
- `skan_conversion_id` - SKAN conversion ID breakdown
- `skan_version` - SKAN version breakdown
- `sot_attribution_model_type` - SOT attribution model type breakdown
- `sot_attribution_window` - SOT attribution window breakdown
- `sot_channel` - SOT channel breakdown
- `sot_event_type` - SOT event type breakdown
- `sot_source` - SOT source breakdown
- `standard_event_content_type` - Standard event content type breakdown
- `is_conversion_id_modeled` - Is conversion ID modeled breakdown
- `is_rendered_as_delayed_skip_ad` - Is rendered as delayed skip ad breakdown
- `impression_view_time_advertiser_hour_v2` - Impression view time advertiser hour v2 breakdown

## Date Presets

| Preset | Description |
|--------|-------------|
| `today` | Today only |
| `yesterday` | Yesterday only |
| `last_3d` | Last 3 days |
| `last_7d` | Last 7 days |
| `last_14d` | Last 14 days |
| `last_28d` | Last 28 days |
| `last_30d` | Last 30 days |
| `last_90d` | Last 90 days |
| `this_month` | Current month |
| `last_month` | Previous month |
| `this_quarter` | Current quarter |
| `last_quarter` | Previous quarter |
| `this_year` | Current year |
| `last_year` | Previous year |
| `maximum` | All available data |
| `data_maximum` | All data with maximum available range |

## Filtering

The `filtering` parameter allows you to filter results based on specific criteria:

```json
{
  "filtering": [
    {
      "field": "campaign.status",
      "operator": "IN",
      "value": ["ACTIVE", "PAUSED"]
    },
    {
      "field": "ad.effective_status",
      "operator": "NOT_IN", 
      "value": ["DELETED", "ARCHIVED"]
    },
    {
      "field": "spend",
      "operator": "GREATER_THAN",
      "value": "100"
    }
  ]
}
```

### Available Operators
- `IN` - Value is in the list
- `NOT_IN` - Value is not in the list
- `EQUAL` - Value equals the specified value
- `NOT_EQUAL` - Value does not equal the specified value
- `GREATER_THAN` - Value is greater than specified value
- `LESS_THAN` - Value is less than specified value

### Common Filter Fields
- `campaign.status` - Campaign status
- `adset.status` - Ad set status
- `ad.effective_status` - Ad effective status
- `spend` - Amount spent
- `impressions` - Number of impressions
- `clicks` - Number of clicks

## Sorting

Use the `sort` parameter to order results:

### Format
- `{metric_name}_ascending` - Sort ascending
- `{metric_name}_descending` - Sort descending

### Examples
- `"spend_descending"` - Highest spend first
- `"ctr_ascending"` - Lowest CTR first
- `"impressions_descending"` - Most impressions first
- `"cost_per_conversion_ascending"` - Lowest CPA first

## Export Formats

### JSON (Default)
Returns structured JSON data with insights, summary, and metadata.

### CSV
Returns comma-separated values suitable for spreadsheet import.

### Excel
Returns CSV format that can be opened in Excel (basic implementation).

## Response Structure

### Standard Response
```json
{
  "insights": [
    {
      "date_start": "2024-01-01",
      "date_stop": "2024-01-31",
      "spend": "1500.00",
      "impressions": "50000",
      "clicks": "2500",
      "ctr": "5.00",
      "cpc": "0.60",
      "cpm": "30.00",
      "reach": "25000",
      "frequency": "2.00"
    }
  ],
  "summary": {
    "totalRecords": 1,
    "dateRange": {
      "start": "2024-01-01",
      "end": "2024-01-31"
    },
    "metrics": ["spend", "impressions", "clicks", "ctr", "cpc", "cpm", "reach", "frequency"],
    "breakdowns": ["age", "gender"],
    "accountId": "act_123456789"
  },
  "exportData": "spend,impressions,clicks,ctr,cpc,cpm,reach,frequency\n1500.00,50000,2500,5.00,0.60,30.00,25000,2.00"
}
```

## Usage Examples

### 1. Basic Performance Report
```json
{
  "campaignId": "123456789",
  "metrics": ["spend", "impressions", "clicks", "ctr", "cpc", "cpm", "reach", "frequency"],
  "datePreset": "last_7d"
}
```

### 2. Advanced Demographic Analysis
```json
{
  "campaignId": "123456789",
  "metrics": ["spend", "impressions", "clicks", "conversions", "cost_per_conversion"],
  "breakdowns": ["age", "gender", "country"],
  "datePreset": "last_30d",
  "sort": "spend_descending",
  "limit": 500
}
```

### 3. Year-to-Date Report with Monthly Breakdown
```json
{
  "adAccountId": "act_123456789",
  "metrics": ["spend", "impressions", "clicks", "cpm", "cpc", "conversions", "cost_per_conversion"],
  "breakdowns": ["month", "campaign_id"],
  "level": "campaign",
  "datePreset": "this_year",
  "sort": "spend_descending",
  "limit": 1000
}
```

### 4. Device & Platform Analysis
```json
{
  "adSetId": "987654321",
  "metrics": ["spend", "impressions", "clicks", "ctr", "cpc"],
  "breakdowns": ["device_platform", "publisher_platform"],
  "datePreset": "last_14d",
  "filtering": [
    {
      "field": "spend",
      "operator": "GREATER_THAN",
      "value": "50"
    }
  ]
}
```

### 5. Export for Analysis
```json
{
  "campaignId": "123456789",
  "metrics": ["spend", "impressions", "clicks", "conversions", "cost_per_conversion"],
  "breakdowns": ["age", "gender", "country"],
  "datePreset": "last_30d",
  "exportFormat": "csv"
}
```

### 6. Video Campaign Analysis
```json
{
  "campaignId": "123456789",
  "metrics": [
    "spend", 
    "impressions", 
    "video_30_sec_watched_actions",
    "video_p50_watched_actions",
    "video_p100_watched_actions",
    "video_thruplay_watched_actions"
  ],
  "breakdowns": ["age", "gender"],
  "datePreset": "last_30d"
}
```

### 7. Conversion-Focused Report
```json
{
  "adAccountId": "act_123456789",
  "metrics": [
    "spend",
    "conversions", 
    "cost_per_conversion",
    "actions",
    "inline_link_clicks",
    "outbound_clicks"
  ],
  "breakdowns": ["conversion_destination", "action_type"],
  "level": "campaign",
  "datePreset": "last_30d",
  "sort": "cost_per_conversion_ascending"
}
```

### 8. Custom Date Range Analysis
```json
{
  "campaignId": "123456789",
  "metrics": ["spend", "impressions", "clicks", "ctr", "cpc"],
  "timeRange": {
    "since": "2024-01-01",
    "until": "2024-01-31"
  },
  "breakdowns": ["day"],
  "sort": "spend_descending"
}
```

## Best Practices

### 1. Metric Selection
- Start with basic metrics for overview reports
- Add conversion metrics for performance analysis
- Include video metrics for video campaigns
- Use cost metrics for budget analysis

### 2. Breakdown Strategy
- Use demographic breakdowns for audience analysis
- Use placement breakdowns for optimization
- Use time breakdowns for trend analysis
- Limit breakdowns to avoid data overload

### 3. Date Range Selection
- Use `last_7d` for recent performance
- Use `last_30d` for monthly analysis
- Use `this_year` for annual reports
- Use custom ranges for specific periods

### 4. Filtering Guidelines
- Filter out inactive campaigns for active performance
- Use spend filters to focus on significant campaigns
- Filter by status to exclude deleted/archived items

### 5. Export Considerations
- Use CSV for spreadsheet analysis
- Use JSON for API integration
- Limit results when exporting large datasets
- Include relevant breakdowns for detailed analysis

## Error Handling

### Common Issues
1. **Invalid Campaign ID**: Ensure the campaign ID exists and you have access
2. **Invalid Metrics**: Use only supported metric names
3. **Invalid Breakdowns**: Use only supported breakdown dimensions
4. **Date Range Conflicts**: Don't use both `datePreset` and `timeRange`
5. **Rate Limiting**: Meta API has rate limits; use appropriate delays

### Troubleshooting
- Check campaign/ad set/ad IDs are correct
- Verify you have the necessary permissions
- Ensure date ranges are valid
- Check that requested metrics are available for the time period

## API Limits

- **Maximum results**: 1000 per request
- **Rate limits**: Follow Meta API rate limiting guidelines
- **Data availability**: Some metrics may not be available for all time periods
- **Breakdown limits**: Too many breakdowns may cause timeouts

## Support

For issues or questions:
1. Check this reference document
2. Verify your Meta access token has necessary permissions
3. Ensure campaign/ad IDs are correct
4. Check Meta Ads API documentation for latest updates

---

*Last updated: September 2024*
*Version: 0.1.0*
