import { ToolDefinition } from './types';
import db from '../db/client';

export const addContactTool: ToolDefinition = {
  name: 'add_contact',
  description:
    'Add a new contact to address book. The address will work on all EVM-compatible networks.',
  parameters: {
    name: {
      name: 'name',
      type: 'string',
      description: 'Contact name',
      required: true,
    },
    address: {
      name: 'address',
      type: 'string',
      description: 'Contact wallet address (works on all EVM networks)',
      required: true,
    },
    notes: {
      name: 'notes',
      type: 'string',
      description: 'Optional notes about the contact',
      required: false,
    },
  },
  handler: async (params, context) => {
    const { name, address, notes } = params as {
      name: string;
      address: string;
      notes?: string;
    };
    const userAddress = context?.userAddress;

    try {
      const user = await db.user.findUnique({ where: { address: userAddress } });
      if (!user) throw new Error('User not found');

      const contact = await db.contact.create({
        data: {
          userId: user.id,
          name,
          address,
          notes,
        },
      });

      return {
        success: true,
        data: {
          contact: {
            id: contact.id,
            name: contact.name,
            address: contact.address,
            notes: contact.notes,
          },
        },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

export const listContactsTool: ToolDefinition = {
  name: 'list_contacts',
  description: 'List all saved contacts with their addresses',
  parameters: {},
  handler: async (_params, context) => {
    const userAddress = context?.userAddress;
    try {
      const user = await db.user.findUnique({
        where: { address: userAddress },
        include: {
          contacts: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!user) throw new Error('User not found');

      return {
        success: true,
        data: {
          contacts: user.contacts.map((c: typeof user.contacts[0]) => ({
            id: c.id,
            name: c.name,
            address: c.address,
            notes: c.notes,
          })),
        },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

export const resolveContactTool: ToolDefinition = {
  name: 'resolve_contact',
  description:
    'Find contact wallet address by name. The address works on all EVM-compatible networks.',
  parameters: {
    name: {
      name: 'name',
      type: 'string',
      description: 'Contact name to resolve',
      required: true,
    },
  },
  handler: async (params, context) => {
    const { name } = params as { name: string };
    const userAddress = context?.userAddress;

    try {
      const user = await db.user.findUnique({
        where: { address: userAddress },
        include: {
          contacts: {
            where: { deletedAt: null },
          },
        },
      });

      if (!user) throw new Error('User not found');

      const contact = user.contacts.find((c: typeof user.contacts[0]) => c.name.toLowerCase() === name.toLowerCase());

      if (!contact) {
        return { success: false, error: 'Contact not found' };
      }

      return {
        success: true,
        data: {
          contact: {
            name: contact.name,
            address: contact.address,
          },
        },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

export const deleteContactTool: ToolDefinition = {
  name: 'delete_contact',
  description: 'Remove a contact from address book',
  parameters: {
    name: {
      name: 'name',
      type: 'string',
      description: 'Contact name to delete',
      required: true,
    },
  },
  handler: async (params, context) => {
    const { name } = params as { name: string };
    const userAddress = context?.userAddress;

    try {
      const user = await db.user.findUnique({
        where: { address: userAddress },
        include: {
          contacts: {
            where: { deletedAt: null },
          },
        },
      });

      if (!user) throw new Error('User not found');

      const contact = user.contacts.find((c: typeof user.contacts[0]) => c.name.toLowerCase() === name.toLowerCase());

      if (!contact) {
        return { success: false, error: 'Contact not found' };
      }

      // Soft delete
      await db.contact.update({
        where: { id: contact.id },
        data: { deletedAt: new Date() },
      });

      return {
        success: true,
        data: {
          message: `Contact ${name} deleted successfully`,
        },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};
