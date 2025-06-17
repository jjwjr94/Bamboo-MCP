import { eq } from 'drizzle-orm';
import { db, withUserContext } from '../db/client.js';
import { adAccounts } from '../db/schema.js';
import { logger } from './logger.js';

export interface AccountContext {
  selectedAccountId?: string;
  availableAccounts: Array<{
    id: string;
    name: string;
    permissions: string[];
    status: string;
    currency?: string;
  }>;
}

export interface AccountSelectionResponse {
  success: boolean;
  accountId?: string;
  requiresSelection?: boolean;
  accounts?: Array<{ id: string; name: string; permissions: string[] }>;
  message?: string;
}

export class AccountManager {
  private contexts = new Map<string, AccountContext>();

  async getAccountContext(userId: string): Promise<AccountContext> {
    if (!this.contexts.has(userId)) {
      const accounts = await this.fetchUserAccounts(userId);
      this.contexts.set(userId, { availableAccounts: accounts });
    }
    const context = this.contexts.get(userId);
    if (!context) {
      // This should not happen because we initialize the context above, but we guard to satisfy the type checker
      throw new Error(`Failed to load account context for user ${userId}`);
    }
    return context;
  }

  async selectAccount(userId: string, accountId: string): Promise<void> {
    const context = await this.getAccountContext(userId);
    const account = context.availableAccounts.find((acc) => acc.id === accountId);
    if (!account) {
      throw new Error(`Account ${accountId} not found or not accessible`);
    }
    context.selectedAccountId = accountId;
    logger.info('Account selected', { userId, accountId, accountName: account.name });
  }

  // Handles account selection: explicit -> current -> single auto-select -> error for multiple
  async requireAccountSelection(userId: string, providedAccountId?: string): Promise<string> {
    const context = await this.getAccountContext(userId);

    if (providedAccountId) {
      await this.selectAccount(userId, providedAccountId);
      return providedAccountId;
    }

    if (context.selectedAccountId) {
      return context.selectedAccountId;
    }

    if (context.availableAccounts.length === 1) {
      context.selectedAccountId = context.availableAccounts[0].id;
      logger.info('Auto-selected single account', {
        userId,
        accountId: context.selectedAccountId,
        accountName: context.availableAccounts[0].name,
      });
      return context.selectedAccountId;
    }

    // Multiple accounts available - return structured error for Claude to handle
    throw new Error(
      `Multiple ad accounts available. Please specify which account to use:\n${context.availableAccounts
        .map((acc) => `- ${acc.id}: ${acc.name}`)
        .join('\n')}`
    );
  }

  async getAccountSelectionResponse(
    userId: string,
    providedAccountId?: string
  ): Promise<AccountSelectionResponse> {
    const context = await this.getAccountContext(userId);

    if (providedAccountId) {
      try {
        await this.selectAccount(userId, providedAccountId);
        return {
          success: true,
          accountId: providedAccountId,
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Account selection failed',
        };
      }
    }

    if (context.selectedAccountId) {
      return {
        success: true,
        accountId: context.selectedAccountId,
      };
    }

    if (context.availableAccounts.length === 1) {
      context.selectedAccountId = context.availableAccounts[0].id;
      logger.info('Auto-selected single account', {
        userId,
        accountId: context.selectedAccountId,
        accountName: context.availableAccounts[0].name,
      });
      return {
        success: true,
        accountId: context.selectedAccountId,
      };
    }

    // Multiple accounts available - return selection options
    return {
      success: false,
      requiresSelection: true,
      accounts: context.availableAccounts,
      message: 'Multiple ad accounts available. Please select one to continue:',
    };
  }

  private async fetchUserAccounts(userId: string) {
    return await withUserContext(userId, async () => {
      const accounts = await db.select().from(adAccounts).where(eq(adAccounts.userId, userId));

      return accounts.map((acc) => ({
        id: acc.id,
        name: acc.name,
        permissions: acc.permissions || ['UNKNOWN'],
        status: acc.status,
        currency: acc.currency || undefined,
      }));
    });
  }

  clearContext(userId: string): void {
    this.contexts.delete(userId);
    logger.info('Account context cleared', { userId });
  }

  async getSelectedAccount(userId: string): Promise<string | undefined> {
    const context = await this.getAccountContext(userId);
    return context.selectedAccountId;
  }
}

// Export a singleton instance
export const accountManager = new AccountManager();
