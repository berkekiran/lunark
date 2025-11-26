import db from '../db/client';

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface CostBreakdown {
  intent: number;
  tools: number;
  response: number;
  total: number;
}

export class UsageTracker {
  // Token costs per 1K tokens (in USD)
  private readonly COSTS = {
    'gpt-4o-mini': {
      input: 0.00015, // $0.15 per 1M tokens
      output: 0.0006, // $0.60 per 1M tokens
    },
    'gpt-4o': {
      input: 0.0025, // $2.50 per 1M tokens
      output: 0.01, // $10.00 per 1M tokens
    },
  };

  private readonly PLATFORM_FEE = 0.05; // 5% platform fee

  async trackUsage(
    userId: string,
    agentId: string | null,
    model: string,
    usage: TokenUsage,
    operationType: 'intent' | 'tool' | 'response'
  ): Promise<void> {
    const cost = this.calculateCost(model, usage);

    console.log(`💰 Tracking usage:`, {
      userId,
      agentId,
      model,
      usage,
      cost,
      operationType,
    });

    try {
      const usageRecord = await db.usage.create({
        data: {
          userId,
          agentId,
          model,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
          cost,
          type: operationType,
        },
      });

      console.log(`✅ Usage record created:`, usageRecord.id);

      // Update user balance (if tracking internally)
      await this.deductBalance(userId, cost);
      console.log(`✅ Balance deducted: $${cost.toFixed(6)}`);
    } catch (error: any) {
      console.error(`❌ Failed to track usage:`, {
        error: error.message,
        stack: error.stack,
        userId,
        cost,
      });
      throw error;
    }
  }

  calculateCost(model: string, usage: TokenUsage): number {
    const costs = this.COSTS[model as keyof typeof this.COSTS] || this.COSTS['gpt-4o-mini'];

    const inputCost = (usage.promptTokens / 1000) * costs.input;
    const outputCost = (usage.completionTokens / 1000) * costs.output;

    const baseCost = inputCost + outputCost;
    const totalCost = baseCost * (1 + this.PLATFORM_FEE);

    console.log(`💵 Cost calculation:`, {
      model,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      inputCost: inputCost.toFixed(8),
      outputCost: outputCost.toFixed(8),
      baseCost: baseCost.toFixed(8),
      platformFee: (baseCost * this.PLATFORM_FEE).toFixed(8),
      totalCost: totalCost.toFixed(8),
    });

    return Number(totalCost.toFixed(6));
  }

  async getAgentUsage(agentId: string): Promise<{
    totalTokens: number;
    totalCost: number;
    breakdown: CostBreakdown;
  }> {
    const usages = await db.usage.findMany({
      where: { agentId },
    });

    const totalTokens = usages.reduce((sum: number, u: typeof usages[0]) => sum + u.totalTokens, 0);
    const totalCost = usages.reduce((sum: number, u: typeof usages[0]) => sum + u.cost, 0);

    const breakdown: CostBreakdown = {
      intent: usages.filter((u: typeof usages[0]) => u.type === 'intent').reduce((sum: number, u: typeof usages[0]) => sum + u.cost, 0),
      tools: usages.filter((u: typeof usages[0]) => u.type === 'tool').reduce((sum: number, u: typeof usages[0]) => sum + u.cost, 0),
      response: usages.filter((u: typeof usages[0]) => u.type === 'response').reduce((sum: number, u: typeof usages[0]) => sum + u.cost, 0),
      total: totalCost,
    };

    return { totalTokens, totalCost, breakdown };
  }

  async getUserUsage(userId: string, startDate?: Date, endDate?: Date) {
    const where: {
      userId: string;
      createdAt?: { gte?: Date; lte?: Date };
    } = { userId };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const usages = await db.usage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const totalTokens = usages.reduce((sum: number, u: typeof usages[0]) => sum + u.totalTokens, 0);
    const totalCost = usages.reduce((sum: number, u: typeof usages[0]) => sum + u.cost, 0);

    // Group by date
    const byDate: Record<string, { tokens: number; cost: number }> = {};
    usages.forEach((u: typeof usages[0]) => {
      const date = u.createdAt.toISOString().split('T')[0];
      if (!byDate[date]) byDate[date] = { tokens: 0, cost: 0 };
      byDate[date].tokens += u.totalTokens;
      byDate[date].cost += u.cost;
    });

    return {
      totalTokens,
      totalCost,
      usageCount: usages.length,
      byDate,
      usages: usages.slice(0, 50), // Return last 50 entries
    };
  }

  async checkBalance(userId: string, estimatedCost: number): Promise<boolean> {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return false;

    return user.balance >= estimatedCost;
  }

  async deductBalance(userId: string, amount: number): Promise<void> {
    console.log(`💳 Deducting $${amount.toFixed(6)} from user ${userId}`);

    try {
      const updatedUser = await db.user.update({
        where: { id: userId },
        data: {
          balance: {
            decrement: amount,
          },
        },
      });

      console.log(`✅ New balance: $${updatedUser.balance.toFixed(2)}`);
    } catch (error: any) {
      console.error(`❌ Failed to deduct balance:`, {
        error: error.message,
        userId,
        amount,
      });
      throw error;
    }
  }

  async addBalance(userId: string, amount: number): Promise<void> {
    await db.user.update({
      where: { id: userId },
      data: {
        balance: {
          increment: amount,
        },
      },
    });
  }

  async getBalance(userId: string): Promise<number> {
    const user = await db.user.findUnique({ where: { id: userId } });
    return user?.balance || 0;
  }

  estimateTokens(text: string): number {
    // Simple estimation: ~4 chars per token
    return Math.ceil(text.length / 4);
  }

  estimateCost(model: string, promptText: string, expectedResponseLength: number = 500): number {
    const promptTokens = this.estimateTokens(promptText);
    const completionTokens = this.estimateTokens(' '.repeat(expectedResponseLength));

    return this.calculateCost(model, {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    });
  }

  async getUsageHistory(userId: string, page: number = 1, limit: number = 5) {
    const skip = (page - 1) * limit;

    const [usages, total] = await Promise.all([
      db.usage.findMany({
        where: { userId, deletedAt: null },
        include: {
          agent: {
            select: { name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.usage.count({
        where: { userId, deletedAt: null },
      }),
    ]);

    // Calculate total cost for each usage entry
    const formattedUsages = usages.map((usage: typeof usages[0]) => ({
      id: usage.id,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      totalCost: usage.cost,
      createdAt: usage.createdAt,
      agent: usage.agent
        ? {
            name: usage.agent.name,
          }
        : null,
    }));

    return {
      usages: formattedUsages,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        currentPage: page,
        limit,
      },
    };
  }
}
