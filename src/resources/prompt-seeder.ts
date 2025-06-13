import { MCPResource, MCPContent, MCPToolCall, ConversationState, PromptSeed, PromptPointer } from '../types';
import { Logger } from '../core/logger';
import Redis from 'ioredis';
import { ConfigService } from '../core/config';
import { promises as fs } from 'fs';
import * as path from 'path';

export class PromptSeeder {
  private logger: Logger;
  private config: ConfigService;
  private redis: Redis;
  private conversationStates: Map<string, ConversationState> = new Map();

  constructor() {
    this.logger = new Logger('PromptSeeder');
    this.config = ConfigService.getInstance();
    this.redis = new Redis(this.config.get('REDIS_URL'));
  }

  public async checkAndInjectPrompt(toolCall: MCPToolCall, userId: string): Promise<void> {
    try {
      // Create a conversation ID based on user and current session
      const conversationId = this.generateConversationId(userId);
      
      // Check if this conversation has already been seeded
      const existingState = await this.getConversationState(conversationId);
      if (existingState?.seeded) {
        this.logger.debug(`Conversation ${conversationId} already seeded`);
        return;
      }

      // Check if this is a Meta Ads or Postgres tool call (first interaction)
      if (toolCall.name.startsWith('ads.') || toolCall.name.startsWith('pg.')) {
        this.logger.info(`First tool call detected for conversation ${conversationId}, seeding prompt`);
        
        // Get the appropriate prompt seed for this user/company
        const promptSeed = await this.getPromptSeed(userId, toolCall.name);
        
        if (promptSeed) {
          // Inject the prompt pointer into the conversation context
          await this.injectPromptPointer(conversationId, promptSeed);
          
          // Mark conversation as seeded
          await this.markConversationSeeded(conversationId);
          
          this.logger.info(`Prompt seeded for conversation ${conversationId}`);
        }
      }
    } catch (error) {
      this.logger.error('Error in prompt seeding:', error);
      // Don't throw - prompt seeding should not break tool calls
    }
  }

  public async getAvailableResources(): Promise<MCPResource[]> {
    try {
      const resources: MCPResource[] = [
        {
          uri: 'mcp://bamboo/prompts/team_default_context.md',
          name: 'Team Default Context',
          description: 'Default company context and guidelines for AI interactions',
          mimeType: 'text/markdown'
        },
        {
          uri: 'mcp://bamboo/prompts/meta_ads_guidelines.md',
          name: 'Meta Ads Guidelines',
          description: 'Best practices and guidelines for Meta Ads management',
          mimeType: 'text/markdown'
        },
        {
          uri: 'mcp://bamboo/prompts/database_guidelines.md',
          name: 'Database Guidelines',
          description: 'Database access patterns and security guidelines',
          mimeType: 'text/markdown'
        },
        {
          uri: 'mcp://bamboo/prompts/company_specific_context.md',
          name: 'Company-Specific Context',
          description: 'Company-specific context and business rules',
          mimeType: 'text/markdown'
        }
      ];

      return resources;
    } catch (error) {
      this.logger.error('Error getting available resources:', error);
      return [];
    }
  }

  public async readResource(uri: string): Promise<MCPContent> {
    try {
      this.logger.info(`Reading resource: ${uri}`);
      
      switch (uri) {
        case 'mcp://bamboo/prompts/team_default_context.md':
          return {
            type: 'text',
            text: await this.getTeamDefaultContext()
          };
          
        case 'mcp://bamboo/prompts/meta_ads_guidelines.md':
          return {
            type: 'text',
            text: await this.getMetaAdsGuidelines()
          };
          
        case 'mcp://bamboo/prompts/database_guidelines.md':
          return {
            type: 'text',
            text: await this.getDatabaseGuidelines()
          };
          
        case 'mcp://bamboo/prompts/company_specific_context.md':
          return {
            type: 'text',
            text: await this.getCompanySpecificContext()
          };
          
        default:
          throw new Error(`Resource not found: ${uri}`);
      }
    } catch (error) {
      this.logger.error(`Error reading resource ${uri}:`, error);
      throw error;
    }
  }

  private generateConversationId(userId: string): string {
    // Generate a conversation ID that's stable for a session but unique per user
    const sessionStart = Math.floor(Date.now() / (1000 * 60 * 30)); // 30-minute sessions
    return `${userId}-${sessionStart}`;
  }

  private async getConversationState(conversationId: string): Promise<ConversationState | null> {
    try {
      const cached = this.conversationStates.get(conversationId);
      if (cached) {
        return cached;
      }

      const redisKey = `conversation:${conversationId}`;
      const stateData = await this.redis.get(redisKey);
      
      if (stateData) {
        const state = JSON.parse(stateData) as ConversationState;
        this.conversationStates.set(conversationId, state);
        return state;
      }

      return null;
    } catch (error) {
      this.logger.error('Error getting conversation state:', error);
      return null;
    }
  }

  private async markConversationSeeded(conversationId: string): Promise<void> {
    try {
      const state: ConversationState = {
        conversationId,
        seeded: true,
        lastActivity: new Date()
      };

      // Cache in memory
      this.conversationStates.set(conversationId, state);

      // Store in Redis with 2-hour expiration
      const redisKey = `conversation:${conversationId}`;
      await this.redis.setex(redisKey, 7200, JSON.stringify(state));
    } catch (error) {
      this.logger.error('Error marking conversation as seeded:', error);
    }
  }

  private async getPromptSeed(userId: string, toolName: string): Promise<PromptSeed | null> {
    try {
      // Determine which prompt to use based on the tool being called
      let promptUri: string;
      
      if (toolName.startsWith('ads.')) {
        promptUri = 'mcp://bamboo/prompts/meta_ads_guidelines.md';
      } else if (toolName.startsWith('pg.')) {
        promptUri = 'mcp://bamboo/prompts/database_guidelines.md';
      } else {
        promptUri = 'mcp://bamboo/prompts/team_default_context.md';
      }

      const pointer: PromptPointer = {
        type: 'mcp_resource',
        uri: promptUri,
        description: 'Context and guidelines for this interaction'
      };

      const content = await this.readResource(promptUri);
      
      return {
        pointer,
        content: content.text || '',
        tokens: this.estimateTokens(content.text || '')
      };
    } catch (error) {
      this.logger.error('Error getting prompt seed:', error);
      return null;
    }
  }

  private async injectPromptPointer(conversationId: string, promptSeed: PromptSeed): Promise<void> {
    try {
      // In a real implementation, this would inject the prompt pointer into the conversation context
      // For now, we'll log the action and store the pointer for potential retrieval
      
      this.logger.info(`Injecting prompt pointer for conversation ${conversationId}:`, {
        uri: promptSeed.pointer.uri,
        tokens: promptSeed.tokens
      });

      // Store the prompt pointer for this conversation
      const redisKey = `prompt_pointer:${conversationId}`;
      await this.redis.setex(redisKey, 7200, JSON.stringify(promptSeed.pointer));
    } catch (error) {
      this.logger.error('Error injecting prompt pointer:', error);
    }
  }

  private estimateTokens(text: string): number {
    // Simple token estimation (roughly 4 characters per token)
    return Math.ceil(text.length / 4);
  }

  private async getTeamDefaultContext(): Promise<string> {
    return `# Team Default Context

## Company Overview
This AI assistant is configured to help with Meta Ads management and database operations for your organization.

## Core Principles
- **Data-Driven Decisions**: Always base recommendations on actual performance data
- **Privacy First**: Maintain strict data privacy and security standards
- **Efficiency Focus**: Optimize for time-saving and automation where possible
- **Transparency**: Provide clear explanations for all recommendations and actions

## Communication Style
- Be concise but thorough in explanations
- Use business-friendly language, avoiding unnecessary technical jargon
- Provide actionable insights and next steps
- Ask clarifying questions when requirements are ambiguous

## Meta Ads Best Practices
- Monitor campaign performance daily during active periods
- Focus on relevant KPIs (ROAS, CPA, CTR, etc.)
- Test ad creatives and audiences systematically
- Maintain proper campaign structure and naming conventions

## Database Operations
- Always verify queries before execution
- Use appropriate indexes and query optimization
- Follow data governance and security policies
- Document significant database changes

## Security Guidelines
- Never expose sensitive customer data
- Use parameterized queries to prevent SQL injection
- Maintain audit logs for all database operations
- Follow principle of least privilege for access control

*This context is automatically injected to ensure consistent, high-quality assistance.*`;
  }

  private async getMetaAdsGuidelines(): Promise<string> {
    return `# Meta Ads Management Guidelines

## Campaign Strategy
- **Objective Alignment**: Ensure campaign objectives match business goals
- **Audience Targeting**: Use detailed targeting combined with lookalike audiences
- **Budget Allocation**: Distribute budget based on performance data, not assumptions
- **Creative Testing**: Always run A/B tests on ad creatives and copy

## Performance Monitoring
- **Daily Checks**: Review performance metrics daily for active campaigns
- **Key Metrics**: Focus on ROAS, CPA, CTR, and conversion rates
- **Anomaly Detection**: Watch for unusual spikes or drops in performance
- **Competitive Analysis**: Monitor competitor activities and adjust accordingly

## Optimization Strategies
- **Bid Adjustments**: Optimize bids based on time of day, device, and location
- **Audience Refinement**: Continuously refine targeting based on performance data
- **Creative Refresh**: Update ad creatives regularly to prevent ad fatigue
- **Landing Page Optimization**: Ensure landing pages are optimized for conversions

## Compliance and Best Practices
- **Ad Policies**: Ensure all ads comply with Meta's advertising policies
- **Data Privacy**: Respect user privacy and follow GDPR/CCPA requirements
- **Attribution**: Use proper attribution models for accurate measurement
- **Documentation**: Maintain detailed records of campaign changes and results

## Troubleshooting Common Issues
- **Low Delivery**: Check audience size, bid amounts, and budget constraints
- **High CPA**: Review targeting, ad quality, and landing page experience
- **Low CTR**: Test new ad creatives and refine audience targeting
- **Account Restrictions**: Follow Meta's guidelines and appeal process if needed

*These guidelines ensure effective and compliant Meta Ads management.*`;
  }

  private async getDatabaseGuidelines(): Promise<string> {
    return `# Database Access Guidelines

## Security First
- **Authentication**: Always use proper authentication and authorization
- **Parameterized Queries**: Use parameterized queries to prevent SQL injection
- **Least Privilege**: Grant minimum necessary permissions for each operation
- **Audit Logging**: Log all database operations for security and compliance

## Query Best Practices
- **Performance**: Use appropriate indexes and avoid full table scans
- **Readability**: Write clear, well-formatted SQL with proper comments
- **Testing**: Test queries on development data before production execution
- **Optimization**: Use EXPLAIN plans to understand query performance

## Data Management
- **Backup Strategy**: Ensure regular backups and test restore procedures
- **Data Integrity**: Maintain referential integrity and data validation rules
- **Archival**: Implement proper data archival and retention policies
- **Monitoring**: Monitor database performance and resource utilization

## Company Profile Management
- **Data Structure**: Store company profiles as JSONB for flexibility
- **Versioning**: Maintain audit trails for profile changes
- **Caching**: Use Redis caching for frequently accessed profiles
- **Validation**: Validate profile data before storage

## Common Operations
- **Profile Retrieval**: Always check cache before database queries
- **Bulk Operations**: Use batch processing for multiple profile updates
- **Search**: Implement efficient search using appropriate indexes
- **Reporting**: Generate reports using optimized queries and caching

## Error Handling
- **Graceful Degradation**: Handle database errors gracefully
- **Retry Logic**: Implement appropriate retry mechanisms for transient failures
- **Monitoring**: Set up alerts for database errors and performance issues
- **Documentation**: Document error scenarios and resolution procedures

*These guidelines ensure secure, efficient, and reliable database operations.*`;
  }

  private async getCompanySpecificContext(): Promise<string> {
    const promptPath = path.resolve(__dirname, 'prompts', 'company_specific_context.md');
    try {
      const content = await fs.readFile(promptPath, 'utf-8');
      return content;
    } catch (err) {
      this.logger.warn(`Could not load company-specific context from file: ${promptPath}. Using default template.`, err);
      return `# Company-Specific Context

## Business Context
This section would typically contain company-specific information such as:
- Industry vertical and target markets
- Key business metrics and KPIs
- Seasonal patterns and business cycles
- Competitive landscape and positioning

## Brand Guidelines
- Brand voice and tone preferences
- Visual identity and creative guidelines
- Messaging frameworks and key value propositions
- Compliance requirements and restrictions

## Operational Preferences
- Preferred campaign structures and naming conventions
- Budget allocation strategies and approval processes
- Reporting requirements and stakeholder preferences
- Integration requirements with other business systems

## Custom Configurations
- Company-specific tool configurations
- Custom metrics and calculated fields
- Automated rules and optimization preferences
- Alert thresholds and notification preferences

*Note: This is a template. In a production environment, this would be populated with actual company-specific information retrieved from the company profile database.*

## Dynamic Content Loading
The system can dynamically load company-specific context based on:
- User authentication and company association
- Company profile data stored in the database
- Custom configuration files per organization
- Integration with external business systems

This ensures that each interaction is properly contextualized for the specific organization and use case.`;
    }
  }
}

