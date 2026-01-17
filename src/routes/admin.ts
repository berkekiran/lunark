import { Router, Response } from 'express';
import { AuthRequest, authenticateApiKey } from '../middleware/auth';
import db from '../db/client';

export const adminRoutes = Router();

// Protect all admin routes with API key
adminRoutes.use(authenticateApiKey);

// Get all users with stats
adminRoutes.get('/users', async (_req: AuthRequest, res: Response) => {
  try {
    const users = await db.user.findMany({
      include: {
        _count: {
          select: {
            contacts: true,
            payments: true,
            usages: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      users: users.map((user: typeof users[0]) => ({
        id: user.id,
        address: user.address,
        role: user.role,
        balance: user.balance,
        createdAt: user.createdAt,
        stats: {
          contacts: user._count.contacts,
          payments: user._count.payments,
          usages: user._count.usages,
        },
      })),
      total: users.length,
    });
  } catch (error: unknown) {
    console.error('Error getting users:', error);
    res.status(500).json({
      error: 'Failed to get users',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get system stats
adminRoutes.get('/stats', async (_req: AuthRequest, res: Response) => {
  try {
    const [userCount, usageCount, paymentCount] = await Promise.all([
      db.user.count(),
      db.usage.count(),
      db.payment.count(),
    ]);

    res.json({
      success: true,
      stats: {
        users: userCount,
        usages: usageCount,
        payments: paymentCount,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error('Error getting stats:', error);
    res.status(500).json({
      error: 'Failed to get stats',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get user details
adminRoutes.get('/users/:userId', async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;

    const user = await db.user.findUnique({
      where: { id: userId },
      include: {
        contacts: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        usages: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: {
          select: {
            contacts: true,
            payments: true,
            usages: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        address: user.address,
        role: user.role,
        balance: user.balance,
        createdAt: user.createdAt,
        contacts: user.contacts,
        usages: user.usages,
        stats: user._count,
      },
    });
  } catch (error: unknown) {
    console.error('Error getting user:', error);
    res.status(500).json({
      error: 'Failed to get user',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Add balance to user
adminRoutes.post('/users/:userId/add-balance', async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { amount, note } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update user balance
    const updatedUser = await db.user.update({
      where: { id: userId },
      data: {
        balance: {
          increment: amount,
        },
      },
    });

    // Create payment record for tracking
    await db.payment.create({
      data: {
        userId,
        amount,
        currency: 'USD',
        status: 'COMPLETED',
        method: 'ADMIN',
        metadata: JSON.stringify({
          note: note || 'Admin added balance',
          addedBy: 'admin',
          addedAt: new Date().toISOString(),
        }),
        completedAt: new Date(),
      },
    });

    res.json({
      success: true,
      user: {
        id: updatedUser.id,
        address: updatedUser.address,
        balance: updatedUser.balance,
      },
      message: `Successfully added $${amount} to user balance`,
    });
  } catch (error: unknown) {
    console.error('Error adding balance:', error);
    res.status(500).json({
      error: 'Failed to add balance',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
