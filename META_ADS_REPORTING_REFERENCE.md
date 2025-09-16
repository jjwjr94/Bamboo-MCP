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
| `adAccountId` | string | Yes | Meta Ad Account ID (act_123456789) | `"act_123456789"` |
| `adId` | string | No | Specific ad ID for ad-level insights | `"123456789"` |
| `adSetId` | string | No | Ad set ID for ad set-level insights | `"123456789"` |
| `campaignId` | string | No | Campaign ID for campaign-level insights | `"123456789"` |
| `level` | string | No | Aggregation level: account, campaign, adset, ad | `"campaign"` |
| `datePreset` | string | No | Predefined date range | `"this_year"` |
| `timeRange` | object | No | Custom date range | `{"since": "2024-01-01", "until": "2024-12-31"}` |

### Metrics Parameters

| Parameter | Type | Required | Description | Default |
|-----------|------|----------|-------------|---------|
| `metrics` | array | No | List of metrics to retrieve | `["spend", "impressions", "clicks", "ctr", "cpc"]` |

### Available Metrics (23 total)

#### Core Performance Metrics
- `spend` - Total amount spent
- `impressions` - Number of times ads were shown
- `clicks` - Number of clicks on ads
- `ctr` - Click-through rate (clicks/impressions)
- `cpc` - Cost per click
- `cpm` - Cost per 1,000 impressions
- `reach` - Number of unique people reached
- `frequency` - Average number of times each person saw the ad

#### Conversion Metrics
- `conversions` - Number of conversions
- `cost_per_conversion` - Cost per conversion
- `actions` - Total number of actions taken

#### Advanced Click Metrics
- `unique_clicks` - Number of unique people who clicked
- `unique_ctr` - Unique click-through rate
- `cost_per_unique_click` - Cost per unique click
- `inline_link_clicks` - Number of inline link clicks
- `cost_per_inline_link_click` - Cost per inline link click
- `outbound_clicks` - Number of outbound clicks

#### Video Metrics
- `video_30_sec_watched_actions` - 30-second video views
- `video_p25_watched_actions` - 25% video completion
- `video_p50_watched_actions` - 50% video completion
- `video_p75_watched_actions` - 75% video completion
- `video_p100_watched_actions` - 100% video completion
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
| `today` | Today's data |
| `yesterday` | Yesterday's data |
| `this_week_sun_today` | This week (Sunday to today) |
| `this_week_mon_today` | This week (Monday to today) |
| `last_week_sun_sat` | Last week (Sunday to Saturday) |
| `last_week_mon_sun` | Last week (Monday to Sunday) |
| `this_month` | This month |
| `last_month` | Last month |
| `this_quarter` | This quarter |
| `last_quarter` | Last quarter |
| `this_year` | This year |
| `last_year` | Last year |
| `last_3_days` | Last 3 days |
| `last_7_days` | Last 7 days |
| `last_14_days` | Last 14 days |
| `last_30_days` | Last 30 days |
| `last_90_days` | Last 90 days |

## Filtering System

### Filter Structure
```json
{
  "field": "campaign.name",
  "operator": "CONTAIN",
  "value": "Holiday"
}
```

### Available Operators
- `EQUAL` - Exact match
- `NOT_EQUAL` - Not equal
- `IN` - Value in list
- `NOT_IN` - Value not in list
- `GREATER_THAN` - Greater than value
- `LESS_THAN` - Less than value
- `CONTAIN` - Contains substring
- `NOT_CONTAIN` - Does not contain substring

### Common Filter Fields
- `campaign.name` - Campaign name
- `campaign.status` - Campaign status
- `adset.name` - Ad set name
- `adset.status` - Ad set status
- `ad.name` - Ad name
- `ad.status` - Ad status
- `spend` - Amount spent
- `impressions` - Number of impressions
- `clicks` - Number of clicks

## Sorting Options

### Sort Format
```
"metric_name_direction"
```

### Available Directions
- `ascending` - Ascending order
- `descending` - Descending order

### Common Sort Examples
- `"spend_descending"` - Sort by spend (highest first)
- `"ctr_ascending"` - Sort by CTR (lowest first)
- `"impressions_descending"` - Sort by impressions (highest first)
- `"cpc_ascending"` - Sort by CPC (lowest first)

## Export Formats

### Available Formats
- `json` - JSON format (default)
- `csv` - CSV format for Excel/spreadsheets
- `excel` - Excel-compatible format

### Export Usage
```json
{
  "exportFormat": "csv"
}
```

## Response Structure

### Success Response
```json
{
  "insights": [
    {
      "date_start": "2024-01-01",
      "date_stop": "2024-01-31",
      "campaign_id": "123456789",
      "campaign_name": "Holiday Campaign",
      "spend": "1500.00",
      "impressions": "50000",
      "clicks": "2500",
      "ctr": "5.00",
      "cpc": "0.60",
      "cpm": "30.00"
    }
  ],
  "summary": {
    "totalRecords": 1,
    "dateRange": {
      "start": "2024-01-01",
      "end": "2024-01-31"
    },
    "metrics": ["spend", "impressions", "clicks", "ctr", "cpc", "cpm"],
    "breakdowns": ["month", "campaign_id"]
  },
  "exportData": "spend,impressions,clicks,ctr,cpc,cpm\n1500.00,50000,2500,5.00,0.60,30.00"
}
```

## Usage Examples

### 1. Basic Campaign Performance Report
```json
{
  "adAccountId": "act_123456789",
  "metrics": ["spend", "impressions", "clicks", "ctr", "cpc"],
  "level": "campaign",
  "datePreset": "last_30_days"
}
```

### 2. Monthly Performance by Campaign
```json
{
  "adAccountId": "act_123456789",
  "metrics": ["spend", "impressions", "clicks", "cpm", "cpc"],
  "breakdowns": ["month", "campaign_id"],
  "level": "campaign",
  "datePreset": "this_year"
}
```

### 3. Demographic Performance Analysis
```json
{
  "adAccountId": "act_123456789",
  "metrics": ["spend", "impressions", "clicks", "ctr", "conversions"],
  "breakdowns": ["age", "gender", "country"],
  "level": "campaign",
  "datePreset": "last_90_days"
}
```

### 4. Device and Platform Performance
```json
{
  "adAccountId": "act_123456789",
  "metrics": ["spend", "impressions", "clicks", "ctr", "cpm"],
  "breakdowns": ["device_platform", "publisher_platform"],
  "level": "campaign",
  "datePreset": "last_30_days"
}
```

### 5. Conversion Analysis with Filtering
```json
{
  "adAccountId": "act_123456789",
  "metrics": ["spend", "conversions", "cost_per_conversion", "ctr"],
  "breakdowns": ["campaign_id"],
  "level": "campaign",
  "datePreset": "last_30_days",
  "filtering": [
    {
      "field": "spend",
      "operator": "GREATER_THAN",
      "value": "100"
    }
  ],
  "sort": "cost_per_conversion_ascending"
}
```

### 6. Video Performance Analysis
```json
{
  "adAccountId": "act_123456789",
  "metrics": [
    "spend", 
    "impressions", 
    "video_30_sec_watched_actions",
    "video_p25_watched_actions",
    "video_p50_watched_actions",
    "video_p75_watched_actions",
    "video_p100_watched_actions"
  ],
  "breakdowns": ["campaign_id"],
  "level": "campaign",
  "datePreset": "last_30_days"
}
```

### 7. Export to CSV
```json
{
  "adAccountId": "act_123456789",
  "metrics": ["spend", "impressions", "clicks", "ctr", "cpc", "cpm"],
  "breakdowns": ["month", "campaign_id"],
  "level": "campaign",
  "datePreset": "this_year",
  "exportFormat": "csv"
}
```

### 8. Custom Date Range with Advanced Metrics
```json
{
  "adAccountId": "act_123456789",
  "metrics": [
    "spend", 
    "impressions", 
    "clicks", 
    "ctr", 
    "cpc", 
    "cpm", 
    "reach", 
    "frequency",
    "conversions",
    "cost_per_conversion"
  ],
  "breakdowns": ["day", "campaign_id"],
  "level": "campaign",
  "timeRange": {
    "since": "2024-01-01",
    "until": "2024-01-31"
  },
  "sort": "spend_descending",
  "limit": 100
}
```

## Best Practices

### 1. Metric Selection
- **Start with core metrics**: spend, impressions, clicks, ctr, cpc
- **Add conversion metrics** for performance analysis
- **Include video metrics** for video campaigns
- **Use reach and frequency** for audience analysis

### 2. Breakdown Strategy
- **Time-based breakdowns**: month, day, week for trend analysis
- **Demographic breakdowns**: age, gender, country for audience insights
- **Campaign structure**: campaign_id, adset_id, ad_id for performance comparison
- **Device/placement**: device_platform, publisher_platform for optimization

### 3. Date Range Selection
- **Use date presets** for standard periods
- **Custom timeRange** for specific analysis periods
- **Consider data freshness** (Meta data can have 24-48 hour delays)

### 4. Filtering and Sorting
- **Filter by spend** to focus on significant campaigns
- **Sort by performance metrics** to identify top performers
- **Use multiple filters** for precise analysis

### 5. Export Considerations
- **CSV format** for spreadsheet analysis
- **JSON format** for programmatic processing
- **Limit results** for large datasets

## Error Handling

### Common Errors

#### 1. Invalid Ad Account ID
```json
{
  "error": "Invalid ad account ID format",
  "code": "INVALID_PARAMETER"
}
```
**Solution**: Ensure ad account ID starts with "act_" prefix

#### 2. Invalid Metrics
```json
{
  "error": "Invalid metric: invalid_metric",
  "code": "INVALID_PARAMETER"
}
```
**Solution**: Use only metrics from the available metrics list

#### 3. Invalid Breakdowns
```json
{
  "error": "Invalid breakdown: invalid_breakdown",
  "code": "INVALID_PARAMETER"
}
```
**Solution**: Use only breakdowns from the available breakdowns list

#### 4. Date Range Issues
```json
{
  "error": "Date range too large",
  "code": "INVALID_PARAMETER"
}
```
**Solution**: Use shorter date ranges or add more specific filters

### Troubleshooting Tips

1. **Check ad account permissions** - Ensure you have access to the ad account
2. **Verify date ranges** - Meta has data retention limits
3. **Use appropriate breakdowns** - Some breakdowns may not be available for all metrics
4. **Check rate limits** - Meta API has rate limiting
5. **Validate parameters** - Ensure all required parameters are provided

## Rate Limits and Best Practices

### Rate Limits
- **600 calls per hour** per ad account
- **50 calls per hour** per user
- **Burst limit**: 10 calls per second

### Optimization Tips
1. **Batch requests** when possible
2. **Use appropriate date ranges** to minimize data volume
3. **Cache results** for repeated queries
4. **Monitor rate limit headers** in responses
5. **Implement exponential backoff** for retries

## Support and Resources

### Documentation
- [Meta Marketing API Documentation](https://developers.facebook.com/docs/marketing-api/)
- [Insights API Reference](https://developers.facebook.com/docs/marketing-api/insights/)
- [Breakdowns Reference](https://developers.facebook.com/docs/marketing-api/insights/breakdowns/)

### Community
- [Meta Developer Community](https://developers.facebook.com/community/)
- [Marketing API Group](https://www.facebook.com/groups/marketingapi/)

### Support
- [Meta Business Support](https://business.facebook.com/support/)
- [API Support](https://developers.facebook.com/support/)