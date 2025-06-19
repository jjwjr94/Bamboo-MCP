import { eq } from 'drizzle-orm';
import { type DbTransaction, withUserContext } from '../db/client.js';
import { type UserAccountContext, adAccounts, users } from '../db/schema.js';
import { DatabaseError, NotFoundError } from './errors.js';
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
  async getAccountContext(userId: string): Promise<AccountContext> {
    return withUserContext(userId, (tx) => this._getAndEnsureAccountContext(userId, tx));
  }

  async selectAccount(userId: string, accountId: string): Promise<void> {
    await withUserContext(userId, async (tx) => {
      const context = await this._getAndEnsureAccountContext(userId, tx);
      const account = context.availableAccounts.find((acc) => acc.id === accountId);

      if (!account) {
        throw new NotFoundError(`Account ${accountId} not found or not accessible`);
      }

      const newContext: UserAccountContext = { ...context, selectedAccountId: accountId };
      await tx.update(users).set({ accountContext: newContext }).where(eq(users.id, userId));

      logger.info('Account selected', { userId, accountId, accountName: account.name });
    });
  }

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
      const accountId = context.availableAccounts[0].id;
      await this.selectAccount(userId, accountId);
      logger.info('Auto-selected single account', {
        userId,
        accountId,
        accountName: context.availableAccounts[0].name,
      });
      return accountId;
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
      const accountId = context.availableAccounts[0].id;
      await this.selectAccount(userId, accountId);
      logger.info('Auto-selected single account', {
        userId,
        accountId,
        accountName: context.availableAccounts[0].name,
      });
      return {
        success: true,
        accountId,
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

  async clearContext(userId: string): Promise<void> {
    await withUserContext(userId, async (tx) => {
      await tx
        .update(users)
        .set({ accountContext: {} }) // Reset to an empty object
        .where(eq(users.id, userId));
    });
    logger.info('Account context cleared', { userId });
  }

  async getSelectedAccount(userId: string): Promise<string | undefined> {
    const context = await this.getAccountContext(userId);
    return context.selectedAccountId;
  }

  // Private helper method to fetch and ensure account context
  private async _getAndEnsureAccountContext(
    userId: string,
    tx: DbTransaction
  ): Promise<AccountContext> {
    const user = await tx.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { accountContext: true },
    });

    if (!user) {
      throw new DatabaseError(`User not found: ${userId}`);
    }

    let context = user.accountContext ?? { availableAccounts: [] };

    // If available accounts are not populated in the DB, fetch and save them
    if (!context.availableAccounts || context.availableAccounts.length === 0) {
      const fetchedAccounts = await this.fetchUserAccounts(userId, tx);
      context = { ...context, availableAccounts: fetchedAccounts };
      await tx.update(users).set({ accountContext: context }).where(eq(users.id, userId));
    }

    // Ensure the returned object matches the AccountContext interface
    return {
      availableAccounts: context.availableAccounts ?? [],
      selectedAccountId: context.selectedAccountId ?? undefined,
    };
  }

  private async fetchUserAccounts(userId: string, tx: DbTransaction) {
    // RLS context is already set by the calling method's withUserContext wrapper
    const accounts = await tx.select().from(adAccounts).where(eq(adAccounts.userId, userId));

    return accounts.map((acc) => ({
      id: acc.id,
      name: acc.name,
      permissions: acc.permissions || ['UNKNOWN'],
      status: acc.status,
      currency: acc.currency || undefined,
    }));
  }
}

export const accountManager = new AccountManager();
