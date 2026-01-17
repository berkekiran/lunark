import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import db from '../db/client';

export const contactsRoutes = Router();

// Get all contacts for user
contactsRoutes.get('/:userId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userAddress = req.userAddress!;
    const { userId } = req.params;

    // Verify user owns this userId
    const user = await db.user.findFirst({
      where: {
        id: userId,
        address: userAddress,
        deletedAt: null,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found or unauthorized' });
    }

    const contacts = await db.contact.findMany({
      where: {
        userId,
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(contacts);
  } catch (error: any) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// Create new contact
contactsRoutes.post('/:userId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userAddress = req.userAddress!;
    const { userId } = req.params;
    const { name, address, networks = [], notes, metadata } = req.body;

    if (!name || !address) {
      return res.status(400).json({ error: 'Name and address are required' });
    }

    // Validate Ethereum address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({ error: 'Invalid Ethereum address format' });
    }

    // Verify user owns this userId
    const user = await db.user.findFirst({
      where: {
        id: userId,
        address: userAddress,
        deletedAt: null,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found or unauthorized' });
    }

    // Check if contact with same name already exists
    const existingContact = await db.contact.findFirst({
      where: {
        userId,
        name,
        deletedAt: null,
      },
    });

    if (existingContact) {
      return res.status(400).json({ error: 'Contact with this name already exists' });
    }

    const contact = await db.contact.create({
      data: {
        userId,
        name,
        address,
        networks,
        notes,
        metadata: metadata || '{}',
      },
    });

    res.json(contact);
  } catch (error: any) {
    console.error('Error creating contact:', error);
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

// Update contact
contactsRoutes.put('/:userId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userAddress = req.userAddress!;
    const { userId } = req.params;
    const { id, name, address, networks, notes, metadata } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Contact ID is required' });
    }

    // Validate Ethereum address format if provided
    if (address && !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({ error: 'Invalid Ethereum address format' });
    }

    // Verify user owns this userId
    const user = await db.user.findFirst({
      where: {
        id: userId,
        address: userAddress,
        deletedAt: null,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found or unauthorized' });
    }

    // Verify contact belongs to user
    const existingContact = await db.contact.findFirst({
      where: {
        id,
        userId,
        deletedAt: null,
      },
    });

    if (!existingContact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Check if name is being changed to one that already exists
    if (name && name !== existingContact.name) {
      const duplicateName = await db.contact.findFirst({
        where: {
          userId,
          name,
          deletedAt: null,
          id: { not: id },
        },
      });

      if (duplicateName) {
        return res.status(400).json({ error: 'Contact with this name already exists' });
      }
    }

    const contact = await db.contact.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(address && { address }),
        ...(networks !== undefined && { networks }),
        ...(notes !== undefined && { notes }),
        ...(metadata !== undefined && { metadata }),
      },
    });

    res.json(contact);
  } catch (error: any) {
    console.error('Error updating contact:', error);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// Delete contact
contactsRoutes.delete('/:userId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userAddress = req.userAddress!;
    const { userId } = req.params;
    const { contactId } = req.query;

    if (!contactId) {
      return res.status(400).json({ error: 'Contact ID is required' });
    }

    // Verify user owns this userId
    const user = await db.user.findFirst({
      where: {
        id: userId,
        address: userAddress,
        deletedAt: null,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found or unauthorized' });
    }

    // Verify contact belongs to user
    const contact = await db.contact.findFirst({
      where: {
        id: contactId as string,
        userId,
        deletedAt: null,
      },
    });

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Soft delete
    await db.contact.update({
      where: { id: contactId as string },
      data: { deletedAt: new Date() },
    });

    res.json({ success: true, message: 'Contact deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting contact:', error);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});
