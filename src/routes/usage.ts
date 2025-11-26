import express from 'express';
import { UsageTracker } from '../services/usage';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();
const usageTracker = new UsageTracker();

// Get agent usage
router.get('/agent/:agentId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const agentId = req.params.agentId; // agentId is now a UUID string
    if (!agentId || agentId.trim() === '') {
      return res.status(400).json({ error: 'Invalid agent ID' });
    }
    const usage = await usageTracker.getAgentUsage(agentId);

    res.json(usage);
  } catch (error) {
    console.error('Get agent usage error:', error);
    res.status(500).json({ error: 'Failed to get agent usage' });
  }
});

// Get user usage
router.get('/user', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate } = req.query;

    const usage = await usageTracker.getUserUsage(
      req.user!.id,
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined
    );

    res.json(usage);
  } catch (error) {
    console.error('Get user usage error:', error);
    res.status(500).json({ error: 'Failed to get user usage' });
  }
});

// Get user balance
router.get('/balance', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const balance = await usageTracker.getBalance(req.user!.id);

    res.json({ balance });
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({ error: 'Failed to get balance' });
  }
});

// Estimate cost
router.post('/estimate', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { model, promptText, expectedResponseLength } = req.body;

    if (!model || !promptText) {
      return res.status(400).json({ error: 'model and promptText are required' });
    }

    const estimatedCost = usageTracker.estimateCost(model, promptText, expectedResponseLength);

    res.json({ estimatedCost });
  } catch (error) {
    console.error('Estimate cost error:', error);
    res.status(500).json({ error: 'Failed to estimate cost' });
  }
});

// Get usage history with pagination
router.get('/history', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = (req.query.userId as string) || req.user!.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 5;

    const history = await usageTracker.getUsageHistory(userId, page, limit);
    res.json(history);
  } catch (error) {
    console.error('Get usage history error:', error);
    res.status(500).json({ error: 'Failed to get usage history' });
  }
});

// Get wallet summary (balance + recent usage + stats)
router.get('/wallet/summary', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;

    // Get all data in parallel
    const [balance, usageStats, recentUsage] = await Promise.all([
      usageTracker.getBalance(userId),
      usageTracker.getUserUsage(userId),
      usageTracker.getUsageHistory(userId, 1, 10),
    ]);

    res.json({
      balance,
      usage: {
        totalTokens: usageStats.totalTokens,
        totalCost: usageStats.totalCost,
        usageCount: usageStats.usageCount,
        byDate: usageStats.byDate,
      },
      recentUsage: recentUsage.usages,
      pagination: recentUsage.pagination,
    });
  } catch (error) {
    console.error('Get wallet summary error:', error);
    res.status(500).json({ error: 'Failed to get wallet summary' });
  }
});

export default router;
