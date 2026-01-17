import { Router, Request, Response } from 'express';
import db from '../db/client';

export const waitlistRoutes = Router();

// Join waitlist
waitlistRoutes.post('/', async (req: Request, res: Response) => {
  try {
    const { email, walletAddress } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Check if email already exists
    const existingEntry = await db.waitlist.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingEntry) {
      return res.status(409).json({
        error: 'Already registered',
        message: 'This email is already on the waitlist'
      });
    }

    // Create waitlist entry
    const entry = await db.waitlist.create({
      data: {
        email: email.toLowerCase(),
        walletAddress: walletAddress || null,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Successfully joined the waitlist',
      id: entry.id,
    });
  } catch (error: any) {
    console.error('Error joining waitlist:', error);
    res.status(500).json({ error: 'Failed to join waitlist' });
  }
});

// Check if wallet address is on waitlist
waitlistRoutes.get('/check/wallet/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;

    const entry = await db.waitlist.findFirst({
      where: { walletAddress: address },
    });

    res.json({
      success: true,
      isOnWaitlist: !!entry,
      email: entry?.email || null,
    });
  } catch (error: any) {
    console.error('Error checking waitlist:', error);
    res.status(500).json({ error: 'Failed to check waitlist' });
  }
});

// Check if email is on waitlist
waitlistRoutes.get('/check/:email', async (req: Request, res: Response) => {
  try {
    const { email } = req.params;

    const entry = await db.waitlist.findUnique({
      where: { email: email.toLowerCase() },
    });

    res.json({
      success: true,
      isOnWaitlist: !!entry,
    });
  } catch (error: any) {
    console.error('Error checking waitlist:', error);
    res.status(500).json({ error: 'Failed to check waitlist' });
  }
});
