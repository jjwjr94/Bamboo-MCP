# Meta Marketing API - Complete Documentation

## Main Page - Marketing API Overview

### Marketing API

The Marketing API is a collection of Graph API endpoints and other features that can be used to help you advertise across Meta technologies. Before advertising on Facebook, Instagram, Messenger, and WhatsApp, we recommend you learn about Meta's ad campaign structure to understand the objects you're working with and how they relate to each other.

**The latest version is**: v23.0

For information on the latest Marketing API version, see the Changelog. For non-versioned changes, see the Out-of-Cycle Changes.

### Get Started

#### Basic Ad Creation
Get detailed guidance on how to set up campaigns, ad sets, and ad creatives, including code samples that illustrate the implementation process.

#### Manage Campaigns  
Learn key operations you can perform using the Marketing API, including how to modify, pause and delete campaigns.

#### Ad Optimization Basics
Use Marketing API endpoints that serve as essential tools for developers to manage audiences and analyze ad campaign insights.

### Related APIs

#### Conversions API
Connect the marketing data on your servers to the Meta systems that optimize ad targeting, decrease cost per action, and measure results.

#### Catalog API
Create a catalog of items you want to promote and use it to run ads, sell from a shop on Facebook or Instagram and more.

#### Business Management API
Create and maintain your business's organic and paid presence on Facebook, Instagram, Messenger, and WhatsApp.

#### Meta Business Extension
Helps businesses connect their Facebook or Instagram profiles to third-party platforms, and easily set up the Meta Pixel, Catalog, and shops.

#### Commerce Platform
Enables businesses to integrate their infrastructure with the tools available to sell products across Meta technologies, including shops and Marketplace.

### Tools & Resources

- Ads Manager
- Business Manager  
- Commerce Manager
- App Dashboard
- Meta Business SDK
- Marketing API Status
- Meta Blueprint
- Meta Developer Community Forums

---



## Overview Section

### Overview

The Marketing API is a Meta business tool designed to empower developers and marketers with the ability to automate advertising efforts across Meta technologies. It offers a comprehensive suite of functionalities that streamline the processes of ad creation, management, and performance analysis.

One of the primary features of the Marketing API is its ability to facilitate the automated creation of ads. You can programmatically generate ad campaigns, ad sets, and individual ads, allowing for rapid deployment and iteration based on real-time performance data. This automation also enables businesses to reach larger audiences with greater efficiency.

In addition to ad creation, you can:

- Update, pause, or delete ads seamlessly
- Ensure that campaigns remain aligned with business objectives
- Access detailed insights and analytics to track ad performance and make data-driven decisions to improve outcomes

### How it Works

#### Ad campaigns

A campaign is the highest level organizational structure within an ad account and should represent a single objective, for example, to drive Page post engagement. Setting the objective of the campaign enforces validation on any ads added to that campaign to ensure they also have the correct objective.

#### Ad sets

Ad sets are groups of ads and are used to configure the budget and period the ads should run for. All ads contained within an ad set should have the same targeting, budget, billing, optimization goal, and duration.

Create an ad set for each target audience with your bid; ads in the set target the same audience with the same bid. This helps control the amount you spend on each audience, determine when the audience will see your ads, and provides metrics for each audience.

#### Ad creatives

Ad creatives contain just the visual elements of the ad and you can't change them once they're created. Each ad account has a creative library to store creatives for reuse in ads.

#### Ads

An ad object contains all of the information necessary to display an ad on Facebook, Instagram, Messenger, and WhatsApp, including the ad creative. Create multiple ads in each ad set to optimize ad delivery based on different images, links, video, text, or placements.

#### Ad Components

This table shows how the various ad components align to the different levels of ad creation.

| Component | Ad Campaign | Ad Set | Ad |
|-----------|-------------|--------|-----|
| **Objective** | ✓ | | |
| **Schedule** | | ✓ | |
| **Budget** | | ✓ | |
| **Bidding** | | ✓ | |
| **Audience** | | ✓ | |
| **Ad Creative** | | | ✓ |

---


### Versioning

The current version of the Marketing API is v23.0.

Facebook's Platform has a core and extended versioning model. With Marketing API versioning, all breaking changes will be in a new version. Multiple versions of Marketing APIs or SDKs can exist at the same time with different functionality in each version.

Developers should understand in advance when a Marketing API or SDK will change. While you have a 90-day window to adopt changes, how and when to move to the new version is your choice.

#### Version Schedules

When a new version of the Marketing API releases, we continue to support the previous version of the Marketing API for at least 90-days. You have at least a 90-days grace period to move over to the new version. During the 90-days grace period, you can call both the current version and the deprecated version, and you have that 90-days grace period to move to the new version. After the 90-days grace period ends, the deprecated version stops working. Once a version is unavailable, any calls made to that version number may fail or be upgraded to the next available version.

For example, Marketing API v17.0 was released on May 23rd, 2023, and Marketing API v16.0 expired on February 6th, 2024, which provided at least 90 days to move over to the new version.

For SDKs, a version always remains available as it is a downloadable package, however beyond its end-of-life date, it may rely upon Marketing APIs or methods which no longer work, so you should assume an end-of-life SDK is no longer functional.

#### Making Versioned Requests

All Marketing API endpoints are available through a versioned path. Pre-pend the version to the start of the request path. For example:

```
curl -G \
-d "access_token=<ACCESS_TOKEN>" \
"https://graph.facebook.com/v23.0/me/adaccounts"
```

This works for all versions, in this general form:

```
https://graph.facebook.com/v{n}/{request-path}
```

where n is the version needed. See a full list of available versions in our Changelog. All of our Marketing API Reference provide per-version information.

#### Migrations

Migrations are only for special scenarios where changes need to be made that cannot go into versioning. Typically this is if the underlying data model has changed. Migrations apply across all versions.

Migrations that are currently still in progress are listed on our migrations page. Migrations have at least a 90-day window during which you must migrate your app. Once a window begins, the post-migration behavior will become the default for new apps. Then, when the migration window is completed, the pre-migration behavior will no longer be available at all.

#### Manage Migrations via Graph API

Migrations can be managed via the migrations field in the /app node.

You can make an update call on the edge to activate and deactivate migrations.

#### Manage Migrations via App Dashboard

You can activate and deactivate available migrations in the App Dashboard under Settings > Migrations. Please note, that the list of migrations may not be the same as in the image below, as the available migrations are different for different apps, at different time. And if you see a migration "Use Graph API v2.0 by default", it is for Graph API only, not Marketing API.

#### Temporary Client-side Activation of Migrations

Instead of activating the migration in your App Dashboard or via the Marketing API, it's possible to add a special flag to your Marketing API calls that sets the migration. The flag is called migrations_override and requires you to specify a JSON blob that describes what migrations you want to turn on or off. For example, if you were making a raw call you could pass:

```
http://graph.facebook.com/path?
migrations_override={"migration1":true, "migration2":false}
```

Using this, you can call the new Marketing API through client updates instead of having to get all callers to update to calling the new Marketing API at the same time. It's also very useful for debugging.

The names for these migrations are found on the /app node mentioned above.

#### Version auto-upgrade

Given the rapid rotation of Marketing API versions approximately every four months, we are streamlining the upgrade process. Starting May 2024, we will enable the auto-version upgrade feature for Marketing API endpoints that are not affected between versions. This means between a version to be deprecated and the next available version, if an endpoint is not affected, the platform will upgrade the call to the next available version, rather than directly failing the request. This change is designed to ensure a smoother, more efficient API experience.

For example, on May 14, 2024, v17.0 will be deprecated. According to the changelog of v18.0, the following endpoints will be affected:

- POST /act_{ad-account-id}/reachfrequencypredictions
- GET /act_{ad-account-id}/reachestimate
- GET /act_{ad-account-id}/delivery_estimate
- POST /act_{ad-account-id}/adsets
- POST /{adset-id}
- POST /act_{ad-account-id}/saved_audiences
- POST /{saved-audience-id}
- POST /act_{ad-account-id}/credit_cards

If your app is calling POST /{adset-id} with v17.0 after it was deprecated on May 14, 2024, this API request will fail as the auto-upgrade is not applied to endpoints affected by next available version (v18.0).

If your app is calling GET /{ad-account-id}/insights with v17.0 after deprecation, the platform will upgrade your call to the next available version (v18.0).

**Note:** If your app is already making calls with versions higher than v17.0, nothing should have changed on the version deprecation date.

To check endpoints affected at each version, please refer to the Marketing API Changelog.

#### FAQ

**Version Schedules**
- What if I don't specify a version for the Marketing API?
- Can I make calls to versions older than the current version?
- How is this different from Platform API versioning?

**Making Versioned Requests**
- How is this different than migrations?

**Version auto-upgrade**
- Does the upgrade only apply to the version to be deprecated and the next available version?
- Does this mean developers don't need to do anything during version deprecation?
- How can I find out which endpoints will not be auto-upgraded?
- How can I opt-out of this behavior?
- Can I check if any specific API call has been auto-upgraded?

---


### Rate Limiting

The Marketing API has its own rate limiting logic and is excluded from all the Graph API rate limitations. So if you make a Marketing API call, it won't be calculated into the Graph API throttling.

The feature that impacts the Marketing API rate limit quota is Ads Management Standard Access. When you add the Marketing API product in your App Dashboard, you will get the **Standard Access** of Ads Management Standard Access by default. This will give you development access to the Marketing API. If you need to upgrade to get more rate limiting quota, upgrade to the **Advanced Access** of Ads Management Standard Access in App Review.

#### Quotas

| Marketing API Access | Ads Management Standard Access | Capacity |
|---------------------|-------------------------------|----------|
| Development access | Standard access | Basic rate limiting quota |
| Standard access | Advanced access | More rate limiting quota |

Most Marketing API requests and Pages API requests are subject to Business Use Case (BUC) Rate Limits and depend on the endpoints you are querying. You should be able to figure this out by checking if your HTTP request contains an X-Business-Use-Case header. See more details in Business Use Case Rate Limits.

#### Ad Account Level API-Level Limits

- Rate limiting is at the ad account level.
- Rate limits happen in real time on a given time range.
- Each Marketing API call is assigned a score. Your score is the sum of your API calls.
- We enforce a maximum score. Generally speaking, a read API call is equal to 1 point, and a write API call is equal to 3 points, and when you reach the maximum score, we throw a throttling error.

If your app is in the Marketing API development tier:
- Your maximum score is 60.
- The decay rate is 300 seconds.
- You will be blocked for 300 seconds if you reach the maximum score.

If your app is on the Standard tier of the Marketing API:
- Your maximum score is 9000.
- The decay rate is 300 seconds.
- You will be blocked for 60 seconds if you reach the maximum score.

**Related error code:** 17, Error subcode: 2446079, Message: User request limit reached. 613, Error subcode: 1487742, Message: There have been too many calls from this ad-account. Please wait a bit and try again.

#### Ads Insights Platform Rate Limiting

- Rate limiting is at the application level.
- Rate limiting is determined by the capacity of backend infra and downstream services.
- When your app is rate limited, all Ads Insights API calls for the app are limited.
- App Level Rate Limiting is enforced.

**Related error code:** 4, Error subcode: 1504022 or 1504039, Message: There have been too many calls from this app. Wait a bit and try again.

When this error is encountered, scale back your calls.

#### App-Level Limits

- Rate limiting is at the application level.
- Rate limiting is determined by total users of an app.
- When your app is rate limited, all calls for the app are limited.
- App Level Rate Limiting is enforced.

**Related error code:** 4, Message: Application request limit reached.

When this error is encountered, scale back your calls.

#### Ad Account Level Business Use Case Rate Limits

We compute the rate limit quota based on your Marketing API access tier and your app.

- Rate limiting is at the ad account level and quota is computed based on your app ads api access tier.
- **ads_management** - For each ad account in a one-hour time period: (100000 if your app is in the Marketing API Standard tier or 300 if your app is in the Dev tier) + 40 * Num of Active ads.
- **custom_audience** - For each ad account in a one-hour time period: No more than 700000. No less than 190000 if your app is in the Marketing API Standard tier or 5000 if your app is in the Dev tier + 40 * Number of Active custom audiences.
- **ads_insights** - For each ad account in a one-hour time period: (190000 if your app is in the Ads API Standard tier or 600 if your app is in the Dev tier) + 400 * Number of Active ads - 0.001 * User Errors.
- **Catalog Management** - For each ad account in a one-hour time period: 20000 + 20000 * log2(unique users).
- **Catalog Batch** - For each ad account in a one-hour time period: 200 + 200 * log2(unique users).
- Your Marketing API rate limit may also be determined by Total CPU time and Total Wall time on your ad account. You will have more quota if your app has Marketing API Standard Access, for more details, check the HTTP [X-Business-Use-Case](/docs/graph-api/overview/rate-limiting#headers-2) header and Business Use Case Rate Limits.

**Related error code:** 80000, 80003, 80004, 80014, Message: There have been too many calls from this ad-account. Wait a bit and try again. For more info, please refer to https://developers.facebook.com/docs/graph-api/overview/rate-limiting.

Verify the API endpoint and HTTP X-Business-Use-Case header to confirm the throttling type. See more details in Business Use Case Rate Limits. When this error is encountered, scale back the changes to the ad account.

#### Ad Account Level Ad Spend Rate Limits

We limit you to changing your account spending limits 10 times per day to ensure the Ads delivery performance.

- Number of changes to the ad account spend such as spend_cap, spend_cap_action fields are limited

**Related error code:** 17, Error subcode: 1885172, Message: You can only change your account spending limit 10 times per day. Please wait to make more changes.

#### Ad Set Level Limits

The number of changes to the ad set daily_budget and lifetime_budget fields are limited. For each ad set, the budget is only allowed to change 4 times per hour, if it exceeds the limit, the budget change for that ad set is blocked for an hour.

**Related error code:** 613, Error subcode: 1487632, Message: You can only change your ad set budget 4 times per hour. Please wait to make more changes.

When this error is encountered, scale back the changes to the ad set.

#### Ad Level Limits

Ad creation is limited for a given ad account based on the daily spend limit.

**Related error code:** 1487225, Message: User request limit reached.

Verify the error code (1487225) and API endpoint to confirm the throttling type. When this error is encountered, scale back the changes. To increase your limit, you can also increase the daily spend limit.

#### Abuse Prevention Rate Limits

When our system detects that certain ad accounts generate a large amount of abnormal traffic, in order to protect the stability of the system and ensure the experience of other users, we will temporarily reduce the API Rate Limit quota of the abnormal accounts. Please try contacting Meta support for help.

**Related error code:** 613, Error subcode: null, Message: (#613) Calls to this api have exceeded the rate limit.

The difference between this and the Ad Account Level API-Level Limit is this error doesn't contain error subcodes. When this error is encountered, investigate if any action is triggering excessive API requests and contact Meta support for help.

#### Handle Throttling Errors

**Initial Assessment**

Check the Marketing API Access Tier:

By default, apps have development_access to the Marketing API. To find out which tier you are in, you can go to the App Review dashboard. You are in the development tier of Marketing API access if you have Standard Access to the Ads Management Standard Access feature. You are in the standard tier of Marketing API access if you have Advanced Access to the Ads Management Standard Access feature. You can also check your HTTP header and look for ads_api_access_tier in your X-Ad-Account-Usage, X-Business-Use-Case or X-FB-Ads-Insights-Throttle header.

If you keep getting rate limiting errors, consider upgrading to the standard_access of the Ads Management Standard Access. To get to the standard tier and get a higher rate limit quota, you can apply for **Advanced Access** to the Ads Management Standard Access feature in your App Review dashboard.

**Check Error Codes:** Determine the specific error codes related to throttling in the API response.

**Check HTTP headers:**
- **X-Ad-Account-Usage** contains acc_id_util_pct, reset_time_duration and ads_api_access_tier.
- **X-Business-Use-Case** contains call_count, total_cputime, total_time and estimated_time_to_regain_access, etc. Info for the Business Use Case endpoint.
- **X-FB-Ads-Insights-Throttle** contains app_id_util_pct, acc_id_util_pct and ads_api_access_tier for the Ads Insights API endpoints.

**Check App Dashboard:** We provide consoles in the App Dashboard that provides developers with in-depth insight into the rate limiting system and helps them diagnose and prevent rate limiting issues.

**Identify the Cause**

- **Rate Limits:** Understand Meta Marketing API rate limits for the different endpoints being used and verify if the number of API requests is within the allowed limits for the application.
- **Burst Limits:** Check if burst limits are causing issues during peak usage times. Usually burst traffic will cause Ad Account Level API-Level Limits (Related error codes: 17, 613).
- **Misoperations:** Investigate if any misoperations are triggering excessive API requests.

**Mitigation Steps**

- **Prevent Burst Traffic:** Distribute API requests evenly to avoid throttling caused by a large number of accesses in a short period of time.
- **Optimize Requests:** Combine multiple smaller requests into batch requests, either IDs batch or async request to minimize the total number of API calls.
- **Backoff Strategy:** Implement exponential backoff when receiving throttling errors, gradually increasing the time between retries. You can also examine HTTP headers for the reset time estimation.

**Other Mitigation Tips**

- Understand if there is a need for this and reduce these calls if unnecessary.
- For endpoints supporting async requests such as Ads Insights API, use Asynchronous Requests to query a huge amount of data.

---


### Data Processing Options for US Users

Limited Data Use is a data processing option that gives you more control over how your data is used in Meta's systems and better supports your compliance efforts with various US state privacy regulations. To utilize this feature, you must proactively enable Limited Data Use. When Meta receives data with Limited Data Use enabled from people in the states where Limited Data Use applies, we will process that data in accordance with our role as a service provider or processor, as applicable, and limit the use of that data as specified in our State-Specific Terms.

#### Meta products that offer the Limited Data Use

The following Meta products offer Limited Data Use. Availability varies by state:

| State | Meta Business Tools (Meta Pixel, App Events via Facebook SDK, App Events API, Conversions API, Offline Conversions API) | Audience Network SDK | Customer List Custom Audiences |
|-------|-------------|-------------|-------------|
| **California** | ✓ | ✓ | ✓ (Effective June 1, 2023) |
| **Colorado** | ✓ (Effective June 1, 2023) | ✓ (Effective June 1, 2023) | ✗ |
| **Connecticut** | ✓ (Effective June 1, 2023) | ✓ (Effective June 1, 2023) | ✗ |
| **Delaware** | ✓ (Effective December 18, 2024) | ✓ (Effective December 18, 2024) | ✗ |
| **Florida** | ✓ (Effective June 24, 2024) | ✓ (Effective June 24, 2024) | ✗ |
| **Montana** | ✓ (Effective September 23, 2024) | ✓ (Effective September 23, 2024) | ✗ |
| **Nebraska** | ✓ (Effective December 18, 2024) | ✓ (Effective December 18, 2024) | ✗ |
| **New Hampshire** | ✓ (Effective December 18, 2024) | ✓ (Effective December 18, 2024) | ✗ |
| **New Jersey** | ✓ (Effective December 18, 2024) | ✓ (Effective December 18, 2024) | ✗ |
| **Oregon** | ✓ (Effective June 24, 2024) | ✓ (Effective June 24, 2024) | ✗ |
| **Texas** | ✓ (Effective June 24, 2024) | ✓ (Effective June 24, 2024) | ✗ |

Limited Data Use is sent through a parameter called Data Processing Options, and it can optionally be sent alongside a user's country and state. If an advertiser is not sure of the country or state, they can opt for Meta to determine if the event or record is from an applicable state.

#### For Business Tools and Audience Network SDK

For Business Tools and Audience Network, Limited Data Use is available only for people in California, Colorado, Connecticut, Delaware, Florida, Montana, Nebraska, New Hampshire, New Jersey, Oregon, or Texas. If a business enables Limited Data Use but does not set the location parameters to US and California, Colorado, Connecticut, Delaware, Florida, Montana, Nebraska, New Hampshire, New Jersey, Oregon, or Texas we will determine if the event is from one of those states. If Limited Data Use is enabled for an event in California, Colorado, Connecticut, Delaware, Florida, Montana, Nebraska, New Hampshire, New Jersey, Oregon, or Texas we will process data in accordance with our role as a service provider or processor and limit the use of that data in accordance with our State-Specific Terms.

Businesses may notice an impact to campaign performance and effectiveness, and retargeting and measurement capabilities will be limited when Limited Data Use is enabled.

#### For Customer List Custom Audiences

For Customer List Custom Audiences, Limited Data Use is available only for people in California. If Limited Data Use is enabled for a record in a customer list from California, we will process data in accordance with our role as a service provider and limit the use of that data in accordance with our State-Specific Terms. If a business enables Limited Data Use but does not set the location parameters to US and California, we will determine if the record is from California.

Businesses may notice an impact to audience size when Limited Data Use is enabled.

---


## Get Started Section

### Get Started with the Marketing API

To effectively utilize the Marketing API, users must follow some key steps to set up their environment and gain access to the API's features. This section covers the prerequisites necessary for getting started.

#### Ad Account Requirements

To manage your ads through the Marketing API, you must have an active ad account. This account is crucial not only for running campaigns but also for managing billing settings and setting spending limits. An ad account allows you to track your advertising expenses, monitor performance, and optimize your campaigns effectively.

#### Finding Your Ad Account Number

Locating your ad account number can be done through the Meta Ads Manager.

1. **Log into Facebook:** Start by logging into your Facebook account that is associated with your business.
2. **Access Ads Manager:** Ads Manager can be found in the drop-down menu in the upper right corner of your Facebook homepage or business page.
3. **Locate your ad account:** In Ads Manager, click on the ad account Settings from the menu on the bottom left of the screen.
4. **View ad account information:** In the Settings screen, you will find your ad account number listed along with other details such as your billing information and spending limits.

#### Meta Developer Account

See Register as a Meta Developer for more information.

#### Create an App

See Create an App for more information on setting up an app in the App Dashboard as well as app types and use cases.

#### Authorization and Authentication

See Authorization for more information on verifying the users and apps that will be accessing the Marketing API and granting them permissions.

See Authentication for more information on getting, extending, and renewing access tokens with the Marketing API.

#### Next Steps

1. Create an Ad Campaign
2. Manage Ad Campaigns
3. Optimize Ad Campaigns

---


## Ad Creative Section

### Creative

An ad creative is an object that contains all the data for visually rendering the ad itself. In the API, there are different types of ads that you can create on Facebook.

If you have a campaign with the Page Post Engagement Objective, you can now create an ad that promotes a post made by the page. This is considered a Page post ad. Page post ads require a field called `object_story_id`, which is the `id` property of a Page post.

An ad creative has three parts:

- Ad creative itself, defined by the visual attributes of the creative object
- Placement that the ad runs on
- Preview of the unit itself, per placement

To create the ad creative object, make the following call:

```bash
curl -X POST \
  -F 'name="Sample Promoted Post"' \
  -F 'object_story_id="<PAGE_ID>_<POST_ID>"' \
  -F 'access_token=<ACCESS_TOKEN>' \
  https://graph.facebook.com/v23.0/act_<AD_ACCOUNT_ID>/adcreatives
```

The response to the API call is the `id` of the creative object. Store this; you need it for the ad object:

```bash
curl -X POST \
  -F 'name="My Ad"' \
  -F 'adset_id="<AD_SET_ID>"' \
  -F 'creative={
       "creative_id": "<CREATIVE_ID>"
     }' \
  -F 'status="PAUSED"' \
  -F 'access_token=<ACCESS_TOKEN>' \
  https://graph.facebook.com/v23.0/act_<AD_ACCOUNT_ID>/ads
```

#### Limits

There are limits on the creative's text, image size, image aspect ratio and other aspects of the creative. See the Ads Guide.

#### Read

In the Ads API, each field you want to retrieve needs to be asked for explicitly, except for `id`. Each object's Reference has a section for reading back the object and lists what fields are readable. For the creative, it's the same fields as specified when creating the object, and `id`.

```bash
curl -G \
  -d 'fields=name,object_story_id' \
  -d 'access_token=<ACCESS_TOKEN>' \
https://graph.facebook.com/v23.0/<CREATIVE_ID>
```

### Placements

A placement is where your ad is shown on Facebook, such as on Feed on desktop, Feed on a mobile device or on the right column. See Ads Product Guide.

We encourage you to run ads across the full range of available placements. Facebook's ad auction is designed to deliver ad impressions to the placement most likely to drive campaign results at the lowest possible cost.

The easiest way to take advantage of this optimization is to leave this field blank. You can also select specific placements in an ad set's target_spec.

This example has a page post ad. The available placements are Mobile Feed, Desktop Feed and Right column of Facebook. In the API, see Placement Options. If you choose `desktopfeed` and `rightcolumn` as the `page_type`, the ad runs on Desktop Feed and Right column placements. Any ad created below this ad set has only the desktop placement.

```bash
curl -X POST \
  -F 'name=Desktop Ad Set' \
  -F 'campaign_id=<CAMPAIGN_ID>' \
  -F 'daily_budget=10000' \
  -F 'targeting={ 
    "geo_locations": {"countries":["US"]}, 
    "publisher_platforms": ["facebook","audience_network"] 
  }' \
  -F 'optimization_goal=LINK_CLICKS' \
  -F 'billing_event=IMPRESSIONS' \
  -F 'bid_amount=1000' \
  -F 'status=PAUSED' \
  -F 'access_token=<ACCESS_TOKEN>' \
  https://graph.facebook.com/v23.0/act_<AD_ACCOUNT_ID>/adsets
```

---


## Bidding Section

### Bidding

Learn how your bids and budget work with Facebook's ad auction and delivery. This covers bidding options, placing bids for desired action, setting budget limits and tracking ads delivery. Facebook's auction functions the same way for API-created ads as they do for ads from Facebook tools. See Ads Help Center, Auction.

#### Main Concepts

- **Bid Strategies** — Provide your bid preferences.
- **Optimization Goals** — Define advertising goals you want to achieve when Facebook delivers your ads.
- **Budgets**
- **Pacing and Scheduling** — Determine how your ads budget is spent over time.
- **Billing Events** - Defines events you want to pay for, including impressions, clicks, or various actions.

#### Common Use Cases

- **Campaign Budget Optimization** — Optimize the distribution of a campaign budget across your campaign's ad sets.
- **Optimized Cost Per Mille Ads** — Prioritize your marketing goals. Then, automatically deliver ads towards these goals in the most effective way possible.
- **Cost Per Action Ads** — Specify conversion events and get charged by the amount of conversions.
- **Reach and Frequency** — Bid on a predicted unique audience reach for your ads on Facebook and Instagram and control display frequency.
- **Bid Multipliers** — Allows you to maintain a nuanced bidding strategy within a single ad set with one targeted audience. **Available on a limited basis.**

#### Documentation Contents

**Overview**
Core concepts and usage requirements. Learn about Budgets, Optimization Goals, and Bid Strategies.

**Guides**
Use case based guides to help you perform specific actions.

**Support**
Get support: FAQs, API updates, helpful links, Reference pages, and Ads Help Center.

---


## Ad Rules Engine Section

### Ad Rules Engine

A central rule management service that helps you easily, efficiently and intelligently manage ads. Without it, you must query the Marketing API to monitor an ad's performance and manually take actions on certain conditions. Since we can express most conditions as logical expressions, we can automate management two ways: using Schedule-based or Trigger-based Based rules.

New to this? Try the rules-based notification quickstart in your App Dashboard, Quickstarts.

#### Documentation Contents

**Overview**
Core concepts and usage requirements. Learn about Evaluation Spec, Execution Spec, and Change Spec.

**Guides**
Use case based guides: Trigger Based Ad Rules, Schedule Based Rules, Advanced Scheduling, Rebalance Budget Ad Rules, ROAS Ad Rules, and API Calls.

---


## Audiences Section

### Audiences

Audience targeting helps you show your ads to the people you care about. There are two general approaches — specific or broad — you can take when creating a target audience. The approach you choose depends on what you're trying to accomplish and your available resources.

You can be specific and create audiences based on customer data, conversion data such as activity in your app or website, etc. Or, you can provide broader information, such as demographics or location, and we deliver ads to people who meet those attributes.

#### Common Uses

- **Lookalike Audiences** — Target people most like your established customers.
- **Custom Audiences** — Build your target custom audience with data from mobile app and website behavior, CRM, and engagement signals. You can also build audiences from offline conversions.
- **Dynamic Audiences** — Build an audience from mobile app and website signals.
- **Targeting Options** — Basic targeting includes demographics and events, location, interests, and behaviors. You can also learn about advanced targeting.

#### Documentation Contents

| Overview | Guides |
|----------|--------|
| The basics of audiences and targeting | Build audiences with data and learn more about our broad targeting options |

| Reference | Special Ad Category |
|-----------|-------------------|
| Explore our basic and advanced targeting options, targeting search, and the Custom Audience Terms of Service contracts | Targeting options available for advertisers offering housing, employment, or credit opportunities |

---


## Insights API Section

### Insights API

Provides a single, consistent interface to retrieve ad statistics.

- Breakdowns - Group results
- Action Breakdowns - Understanding the response from action breakdowns.
- Async Jobs - For requests with large results, use asynchronous jobs
- Limits and Best Practices - Call limits, filtering and best practices.

Before you can get data on your ad's performance, you should set up your ads to track the metrics you are interested in. For that, you can use URL Tags, Meta Pixel, and the Conversions API.

#### Before you begin

You will need:

- The `ads_read` permission.
- An app. See Meta App Development for more information.

#### Campaign Statistics

To get the statistics of a campaign's last 7 day performance:

```bash
curl -G \
  -d "date_preset=last_7d" \
  -d "access_token=ACCESS_TOKEN" \
  "https://graph.facebook.com/API_VERSION/AD_CAMPAIGN_ID/insights"
```

To learn more, see the Ad Insights Reference.

#### Making Calls

The Insights API is available as an edge on any ads object.

**Request**

You can request specific fields with a comma-separated list in the `fields` parameters. For example:

```bash
curl -G \
-d "fields=impressions" \
-d "access_token=ACCESS_TOKEN" \
"https://graph.facebook.com/v23.0/<AD_ID>/insights"
```

**Response**

```json
{
  "data": [
    {
      "impressions": "2466376",
      "date_start": "2009-03-28",
      "date_stop": "2016-04-01"
    }
  ],
  "paging": {
    "cursors": {
      "before": "MAZDZD",
      "after": "MAZDZD"
    }
  }
}
```

#### Levels

Aggregate results at a defined object level. This automatically deduplicates data.

**Request**

For example, get a campaign's insights on ad level.

```bash
curl -G \
-d "level=ad" \
-d "fields=impressions,ad_id" \
-d "access_token=ACCESS_TOKEN" \
"https://graph.facebook.com/v23.0/CAMPAIGN_ID/insights"
```

**Response**

```json
{
  "data": [
    {
      "impressions": "9708",
      "ad_id": "6142546123068",
      "date_start": "2009-03-28",
      "date_stop": "2016-04-01"
    },
    {
      "impressions": "18841",
      "ad_id": "6142546117828",
      "date_start": "2009-03-28",
      "date_stop": "2016-04-01"
    }
  ],
  "paging": {
    "cursors": {
      "before": "MAZDZD",
      "after": "MQZDZD"
    }
  }
}
```

If you don't have access to all ad objects at the requested level, the insights call returns no data. For example, while requesting insights with `level` set to `ad`, if you don't have access to one or more ad objects under the ad account, this API call will return a permission error.

#### Attribution windows

The **conversion attribution window** provides timeframes that define when we attribute an event to an ad on a Meta app. For background information, see Meta Business Help Center, About attribution windows. We measure the actions that occur when a conversion event occurs and look back in time 1-day and 7-days. To view actions attributed to different attribution windows, make a request to `/{ad-account-id}/insights`. If you do not provide `action_attribution_windows` we use `7d_click` and provide it under `value`.

#### Field Expansion

Request fields at the node level and by fields specified in field expansion.

**Request**

```bash
curl -G \
-d "fields=insights{impressions}" \
-d "access_token=ACCESS_TOKEN" \
"https://graph.facebook.com/v23.0/AD_ID"
```

---


## Brand Safety and Suitability Section

### Brand Safety and Suitability

Meta offers several brand suitability controls to help you place ads adjacent to organic content that is more suitable for your brand on Facebook, Instagram and Meta Audience Network. You can apply one control or use them in combination. Meta keeps your brand safe by enforcing Facebook Community Standards and Instagram Community Guidelines for all content and publishers. Learn more about brand suitability.

#### Documentation Links

| Integration Setup | Block Lists API |
|------------------|-----------------|
| An overview of initial setup steps required for program participation. The main elements it addresses include: setting up a business in Business Manager, creating and obtaining access to ad accounts, and creating an app to access Meta's API. | Block lists stop your ads from appearing with publishers you don't consider suitable for your brand or campaign. |

| Content Allow Lists API | Content Delivery Reports API |
|------------------------|------------------------------|
| Content Allow Lists give you the ability to work with trusted Meta Business Partners to review and customize lists of brand suitable videos for running Facebook in-stream campaigns. | Content delivery reports provide transparency into where ads appeared and show impressions at the content level. |

| Feed Verification API | Partner-publisher Lists API |
|----------------------|----------------------------|
| Feed verification allows you to measure, verify and understand the suitability of content near your ads to help you make informed decisions in order to reach your marketing goals. | Partner-publisher lists show publishers that have signed up for monetization and follow our Partner Monetization Policies. |

| Passback API | Publisher Delivery Reports API |
|--------------|-------------------------------|
| Passback allows Meta Business Partners to share content risk labels and campaign performance data with Meta. The goals are to provide advertisers and partners with a mechanism to give feedback on content, for Meta to be able to take action on that feedback, and for Meta and partners to be able to compare content labels. | Publisher delivery reports provide transparency into where ads appeared and show impressions at the publisher level. |

---


## Best Practices Section

### Best Practices

#### Ad Changes Triggering Ad Reviews

If you make any changes to the following scenarios, your ad will be triggered for review:

- Any changes to your creative (image, text, link, video, and so on)
- Any changes to targeting
- Any changes of optimization goals and billing events may also trigger review

**Note**: Changes to bid amount, budget, and ad set schedule will not have any effect on the review status.

Additionally, if an ad enters Ad Review with the run status of "Paused", then it will remain Paused upon exiting Ad Review. Otherwise, the ad will be considered Active and ready to deliver.

#### Pagination

For paging response data, see the Graph API Pagination.

#### User Information

You should store user IDs, session keys, and the ads account ID so it is easy to programmatically access them and keep them together. This is important because any calls made with an account ID belonging to one user and the session key for another user will fail with a permissions error. Any storages of user data must be done in compliance with Facebook Platform Terms and Developer Policies.

#### Suggested Bids

Run frequent reports on your campaigns, as suggested bids change dynamically in response to bidding by competitors using similar targeting. Bid suggestions get updated within a few hours, depending upon the bidding of competitors.

#### Batch Requests

Make multiple requests to the API with a single call, see:

- Multiple Requests
- Batch Requests

You can also query for multiple objects by ID as follows:

```
https://graph.facebook.com/<API_VERSION>?ids=[id1,id2]
```

To query for a specific field:

```
https://graph.facebook.com/<API_VERSION>?ids=[id1,id2]&fields=field1,field2
```

#### Check Data Changes using ETags

Quickly check if the response to a request has changed since you last made it, see:

- ETags blog
- ETags Reference

Ad objects have two types of delete states: archived and deleted. You can query both archived and deleted objects with the object id. However, we do not return deleted objects if you request it from another object's edge.

You can have up to 5000 archived objects at any time. You should move ad objects from archived states to deleted states if you no longer need to retrieve them via edges.

#### Viewing Errors

People make mistakes and try to create ads that are not accepted, Error Codes provide reasons an API call failed. You should share some form of the error to users so they can fix their ads.

#### Facebook Marketing Developer Community Group

Join Facebook Marketing Developer Community group on Facebook for news and update on for Marketing API. We post items from the Marketing API blog to the group.

#### Testing

Sandbox mode is a testing environment to read and write Marketing API calls without delivering actual ads. See Sandbox Mode for Developers.

Try API calls with Graph API Explorer. You can try any API call you would like to make to the Marketing API. Select your app in `App`, and grant your app `ads_management` or `ads_read` permission in `extended permissions` when you create an access token. Use `ads_read` if you only need Ads Insights API access for reporting. Use `ads_management` to read and update ads in an account.

For development and basic access, configure a list of ad accounts your app is able to make API calls for, see account list.

You can use sandbox mode to demonstrate your app for app review. However in sandbox mode you cannot create ads or ad creative. Therefore you should use hard coded ad IDs and ad creative IDs to demonstrate your use of our API for app review.

**Basic Criteria**

- Demonstrate value beyond Facebook's core solutions, such as Facebook Ads Manager.
- Focus on business objectives, such as increase in sales. Facebook business objectives can be found here.

#### Policies

Understand the API policies; Facebook has the right to audit your activity anytime:

- **Platform Terms**
- **Developer Policies**
- **Promotion Policies**
- **Data Use Policy**
- **Statement of Rights and Responsibilities**
- **Advertising Guidelines**

Be ready to adapt quickly to changes. Most changes are versioned and change windows are 90 days, ongoing.

In Statement of Rights and Responsibilities, you are financially and operationally responsible for your application, its contents, and your use of the Meta Platform and the Ads API. You should manage your app's stability and potential bugs.

---


## Troubleshooting Section

### Troubleshooting

Working with the Marketing API can occasionally present challenges. Below are issues users may encounter, along with practical solutions to help streamline your experience.

#### Error Handling

Use the error handling techniques and best practices below to enhance the reliability and efficiency of your applications.

**Authorization Errors**

These errors often occur due to access tokens that are expired, invalid, or lacking the necessary permissions. To mitigate these issues, ensure that tokens are refreshed regularly and that the correct scopes are requested during authorization.

**Invalid Parameters**

Sending requests with incorrect or missing parameters can lead to errors. Always validate the input data before making API calls. Utilizing validation tools can significantly reduce such errors.

**Resource Not Found**

This error occurs when attempting to access a resource that does not exist or has been deleted. To resolve this, check that resources (like campaigns or ad sets) exist before performing operations on them.

**Rate Limiting**

The Marketing API enforces rate limits to prevent abuse. Exceeding these limits results in error messages indicating that too many requests have been made in a short time. Employing exponential backoff strategies can help slow down request rates after hitting the limit.

To optimize performance and avoid hitting rate limits, create a queue system for API requests. This allows for controlled pacing of requests, ensuring compliance with the API's limits without sacrificing performance.

**Caching Strategies**

Implement caching for frequently accessed data, such as audience insights or ad performance metrics. This reduces the number of API calls and speeds up data retrieval, leading to a more efficient application.

**Managing API Versioning**

Stay informed about updates and changes in the Marketing API by regularly checking the documentation. Placing API calls within version-specific functions can prepare your application for version changes, allowing for independent updates.

**Error Logging and Monitoring**

Implement robust error logging to track API interactions. This will help identify patterns in errors and facilitate quicker resolutions. Utilizing monitoring tools can alert developers to critical failures or unusual patterns in API usage.

---


## API Reference Section

### Marketing API Reference

This is a full list of root nodes for the Facebook Marketing API with links to reference docs for each. For background on the API's architecture how to call root nodes and their edges, see Using the Graph API.

To access all reference information you will need to be logged in to Facebook.

#### Marketing API Root Nodes

**User**

Edges:
- `/adaccounts` - All ad accounts associated with this person
- `/accounts` - All pages and places that someone is an admin of
- `/promotable_events` - All promotable events you created or promotable page events that belong to pages you are an admin for

**Ad Account**

All collections of ad objects in Marketing APIs belong to an ad account.

The most popular edges of the Ad Account node:
- `/adcreatives` - Defines your ad's appearance and content
- `/adimages` - Library of images to use in ad creatives. Can be uploaded and managed independently
- `/ads` - Data for an ad, such as creative elements and measurement information
- `/adsets` - Contain all ads that share the same budget, schedule, bid, and targeting
- `/advideos` - Library of videos for use in ad creatives. Can be uploaded and managed independently
- `/campaigns` - Define your campaigns' objective and contain one or more ad sets
- `/customaudiences` - The custom audiences owned by/shared with this ad account
- `/insights` - Interface for insights. De-dupes results across child objects, provides sorting, and async reports.
- `/users` - List of people associated with an ad account

**Ad**

An individual ad associated with an ad set.

The most popular edges of the Ad node:
- `/adcreatives` - Defines your ad's appearance and content
- `/insights` - Insights on your advertising performance.
- `/leads` - Any leads associated with with a Lead Ad.
- `/previews` - Generate ad previews from an existing ad

**Ad Set**

An ad set is a group of ads that share the same daily or lifetime budget, schedule, bid type, bid info, and targeting data.

The most popular edges of the Ad Set node:
- `/activities` - Log of actions taken on the ad set
- `/adcreatives` - Defines your ad's content and appearance
- `/ads` - Data necessary for an ad, such as creative elements and measurement information
- `/insights` - Insights on your advertising performance.

**Ad Campaign**

A campaign is the highest level organizational structure within an ad account and should represent a single objective for an advertiser.

The most popular edges of the Ad Campaign node:
- `/ads` - Data necessary for an ad, such as creative elements and measurement information
- `/adsets` - Contain all ads that share the same budget, schedule, bid, and targeting.
- `/insights` - Insights on your advertising performance.

**Ad Creative**

The format which provides layout and contains content for the ad.

The most popular edges of the Ad Creative node:
- `/previews` - Generate ad previews from the existing ad creative object

---


## Changelog Section

### Changelog

The latest Graph API version is: **v23.0**

The Marketing API changelog documents versioned and out-of-cycle changes, respective to the API.

#### Versioned Changes

Versioned changes are changes introduced with the release of a new API version. Versioned changes typically apply to the newest version immediately and often will apply to other versions at a future date. The changelog accompanying each release indicates which changes apply to the current release and which changes apply to other versions.

Refer to our Upgrade Guide to learn how to upgrade to a new API version.

#### Out-Of-Cycle Changes

Out-of-cycle changes are changes introduced outside of our normal, versioned release schedule and typically do not apply to a specific version. Instead, out-of-cycle changes usually apply to all API versions immediately.

The content of out-of-cycle changes, captured bi-weekly, is automatically generated based on the API changes and is reflected in the files in the API spec folder.

#### Available Marketing API Versions

| Version | Date Introduced | Available Until |
|---------|----------------|-----------------|
| v23.0   | May 29, 2025   | TBD            |
| v22.0   | January 21, 2025 | TBD          |
| v21.0   | October 2, 2024 | TBD           |
| v20.0   | May 21, 2024   | May 6, 2025    |

---

## Summary

This comprehensive documentation covers all major sections of the Meta Marketing API:

1. **Overview** - Introduction to the Marketing API, versioning, rate limiting, and data processing options
2. **Get Started** - Basic setup and getting started guide
3. **Ad Creative** - Creating and managing ad creatives
4. **Bidding** - Bidding strategies and optimization
5. **Ad Rules Engine** - Automated ad management with schedule-based and trigger-based rules
6. **Audiences** - Targeting options, custom audiences, lookalike audiences, and audience management
7. **Insights API** - Retrieving ad statistics and performance data
8. **Brand Safety and Suitability** - Brand safety controls and content suitability APIs
9. **Best Practices** - Development best practices, error handling, and optimization tips
10. **Troubleshooting** - Common issues and solutions for API integration
11. **API Reference** - Complete reference for all API endpoints and objects
12. **Changelog** - Version history and API changes

The Meta Marketing API provides a comprehensive platform for programmatically managing Facebook and Instagram advertising campaigns, with robust features for ad creation, audience targeting, performance tracking, and campaign optimization.

