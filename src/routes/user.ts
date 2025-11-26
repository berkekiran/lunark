import { Router, Response } from 'express';
import { ethers } from 'ethers';
import { AuthRequest, authenticateToken, generateToken } from '../middleware/auth';
import db from '../db/client';

export const userRoutes = Router();

// Authenticate user with wallet signature
userRoutes.post('/auth', async (req, res: Response) => {
  try {
    const { address, signature, message } = req.body;

    if (!address || !signature || !message) {
      return res.status(400).json({ error: 'Address, signature, and message are required' });
    }

    // Verify the signature
    let recoveredAddress: string;
    try {
      recoveredAddress = ethers.verifyMessage(message, signature);
    } catch {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Check if recovered address matches claimed address
    if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
      return res.status(401).json({ error: 'Signature does not match address' });
    }

    // Verify message contains a recent timestamp (within 5 minutes)
    const timestampMatch = message.match(/Timestamp: (\d+)/);
    if (timestampMatch) {
      const messageTimestamp = parseInt(timestampMatch[1]);
      const now = Date.now();
      const fiveMinutes = 5 * 60 * 1000;
      if (Math.abs(now - messageTimestamp) > fiveMinutes) {
        return res.status(401).json({ error: 'Signature expired' });
      }
    }

    let user = await db.user.findFirst({
      where: {
        address: address.toLowerCase(),
        deletedAt: null,
      },
      include: {
        settings: true,
      },
    });

    if (!user) {
      // Create user with settings
      user = await db.user.create({
        data: {
          address: address.toLowerCase(),
          settings: {
            create: {},
          },
        },
        include: {
          settings: true,
        },
      });
    }

    // Generate session token
    const sessionToken = generateToken(user);

    // Update user with session token
    user = await db.user.update({
      where: { id: user.id },
      data: {
        sessionToken,
        sessionTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
      include: {
        settings: true,
      },
    });

    res.json({
      success: true,
      user,
      token: sessionToken,
    });
  } catch (error: any) {
    console.error('Error authenticating user:', error);
    res.status(500).json({ error: 'Failed to authenticate user' });
  }
});

// Get user info (authenticated)
userRoutes.get('/me', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userAddress = req.userAddress!;

    const user = await db.user.findFirst({
      where: {
        address: userAddress,
        deletedAt: null,
      },
      include: {
        settings: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      user,
    });
  } catch (error: any) {
    console.error('Error fetching user info:', error);
    res.status(500).json({ error: 'Failed to fetch user info' });
  }
});

// Update user settings (authenticated)
userRoutes.put('/settings', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userAddress = req.userAddress!;
    const { llmModel, temperature, maxTokens } = req.body;

    const user = await db.user.findFirst({
      where: {
        address: userAddress,
        deletedAt: null,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const settings = await db.userSettings.upsert({
      where: { userId: user.id },
      update: {
        ...(llmModel && { llmModel }),
        ...(temperature !== undefined && { temperature }),
        ...(maxTokens && { maxTokens }),
      },
      create: {
        userId: user.id,
        ...(llmModel && { llmModel }),
        ...(temperature !== undefined && { temperature }),
        ...(maxTokens && { maxTokens }),
      },
    });

    res.json({
      success: true,
      settings,
    });
  } catch (error: any) {
    console.error('Error updating user settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Sign terms of service
userRoutes.post('/terms', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userAddress = req.userAddress!;
    const { signature } = req.body;

    if (!signature) {
      return res.status(400).json({ error: 'Signature is required' });
    }

    const user = await db.user.findFirst({
      where: {
        address: userAddress,
        deletedAt: null,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updatedUser = await db.user.update({
      where: { id: user.id },
      data: {
        termsSignature: signature,
        termsSignedAt: new Date(),
      },
    });

    res.json({
      success: true,
      user: updatedUser,
    });
  } catch (error: any) {
    console.error('Error signing terms:', error);
    res.status(500).json({ error: 'Failed to sign terms' });
  }
});

// Delete user account (soft delete)
userRoutes.delete('/me', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userAddress = req.userAddress!;

    const user = await db.user.findFirst({
      where: {
        address: userAddress,
        deletedAt: null,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await db.user.update({
      where: { id: user.id },
      data: {
        deletedAt: new Date(),
        sessionToken: null,
        sessionTokenExpiresAt: null,
      },
    });

    res.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});
