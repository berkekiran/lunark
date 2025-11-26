import { ToolDefinition } from './types';
import db from '../db/client';

export const walletBalanceTool: ToolDefinition = {
  name: 'get_wallet_balance',
  description: 'Get Lunark wallet balance and usage statistics for the current user. This shows the internal platform balance in USD that is used to pay for AI usage.',
  parameters: {},
  handler: async (_params, context) => {
    try {
      const userAddress = context?.userAddress;

      if (!userAddress) {
        return {
          success: false,
          error: 'User address not found in context',
        };
      }

      // Get user with balance
      const user = await db.user.findFirst({
        where: {
          address: userAddress,
          deletedAt: null,
        },
      });

      if (!user) {
        return {
          success: false,
          error: 'User not found',
        };
      }

      // Get usage statistics
      const usageStats = await db.usage.aggregate({
        where: {
          userId: user.id,
          deletedAt: null,
        },
        _sum: {
          totalTokens: true,
          cost: true,
        },
        _count: true,
      });

      // Get recent payments
      const recentPayments = await db.payment.findMany({
        where: {
          userId: user.id,
          status: 'COMPLETED',
        },
        orderBy: {
          completedAt: 'desc',
        },
        take: 5,
        select: {
          amount: true,
          currency: true,
          completedAt: true,
          method: true,
        },
      });

      return {
        success: true,
        data: {
          balance: user.balance,
          currency: 'USD',
          usage: {
            totalTokens: usageStats._sum.totalTokens || 0,
            totalCost: usageStats._sum.cost || 0,
            totalRequests: usageStats._count,
          },
          recentPayments: recentPayments.map((p: typeof recentPayments[0]) => ({
            amount: p.amount,
            currency: p.currency,
            date: p.completedAt?.toISOString(),
            method: p.method,
          })),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to get wallet balance',
      };
    }
  },
};
