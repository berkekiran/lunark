import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import db from '../db/client';
import { LunarkAgent } from '../agents/lunark-agent';

export const historyRoutes = Router();

// Get chat history with pagination
historyRoutes.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userAddress = req.userAddress!;
    const userId = req.query.userId as string;
    const page = parseInt(req.query.page as string) || 1;
    const requestedLimit = parseInt(req.query.limit as string);
    const limit = requestedLimit === -1 ? undefined : (requestedLimit || 50);
    const offset = limit ? (page - 1) * limit : 0;

    // Verify user exists
    const user = await db.user.findFirst({
      where: {
        id: userId,
        address: userAddress,
        deletedAt: null,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Initialize agent to get agent ID
    const lunarkAgent = new LunarkAgent(userAddress);
    await lunarkAgent.initialize();
    const astreusAgent = lunarkAgent.getAgent();

    if (!astreusAgent) {
      return res.status(500).json({ error: 'Failed to initialize agent' });
    }

    const agentId = astreusAgent.id;

    // Get graphs (chats) for this agent from database
    // Each graph represents a conversation
    const queryOptions: any = {
      where: {
        defaultAgentId: agentId,
      },
      orderBy: {
        updated_at: 'desc',
      },
    };

    // Add pagination if limit is specified
    if (limit !== undefined) {
      queryOptions.take = limit;
      queryOptions.skip = offset;
    }

    const graphs = await db.graphs.findMany(queryOptions);

    // Get total count for pagination
    const totalCount = await db.graphs.count({
      where: {
        defaultAgentId: agentId,
      },
    });

    // Build history items from graphs
    const history = await Promise.all(
      graphs.map(async (graph: typeof graphs[0]) => {
        // Extract chatId from graph name (format: "Chat-{chatId}")
        const chatId = graph.name.replace('Chat-', '');

        // Get first task from this graph for title (sorted by createdAt to get the actual first message)
        const graphInstance = await lunarkAgent.getOrCreateGraph(chatId);
        const tasks = ((await graphInstance.getTasks({ limit: 10 })) as any[])
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

        // Use originalMessage from metadata if available (to avoid showing conversation history prefix)
        // Fall back to prompt if metadata is not available
        let title = 'New Conversation';
        if (tasks.length > 0) {
          const firstTask = tasks[0];
          const messageContent = firstTask.metadata?.originalMessage || firstTask.prompt;
          // Also strip any "--- CONVERSATION HISTORY ---" prefix if it somehow leaked through
          const cleanMessage = messageContent.replace(/^---\s*CONVERSATION HISTORY\s*---[\s\S]*?Current message from user:\s*/i, '').trim();
          title = cleanMessage.substring(0, 50) + (cleanMessage.length > 50 ? '...' : '');
        }

        return {
          id: chatId,
          title,
          userId: user.id,
          createdAt: graph.created_at,
          updatedAt: graph.updated_at,
        };
      })
    );

    await lunarkAgent.destroy();

    res.json({
      success: true,
      history,
      total: totalCount,
      hasMore: limit !== undefined ? (offset + limit) < totalCount : false,
    });
  } catch (error: any) {
    console.error('Error fetching history:', error);
    res.status(500).json({
      error: 'Failed to fetch history',
      message: error.message,
    });
  }
});

// Delete multiple chat items
historyRoutes.delete('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userAddress = req.userAddress!;
    const { ids, userId } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Chat IDs are required' });
    }

    // Verify user exists
    const user = await db.user.findFirst({
      where: {
        id: userId,
        address: userAddress,
        deletedAt: null,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Initialize agent to get agent ID
    const lunarkAgent = new LunarkAgent(userAddress);
    await lunarkAgent.initialize();
    const astreusAgent = lunarkAgent.getAgent();

    if (!astreusAgent) {
      return res.status(500).json({ error: 'Failed to initialize agent' });
    }

    const agentId = astreusAgent.id;

    // Delete graphs for the specified chatIds
    // chatIds are like "chat_1234567890_abc12345"
    // Graph names are "Chat-{chatId}"
    const graphNames = ids.map(chatId => `Chat-${chatId}`);

    const result = await db.graphs.deleteMany({
      where: {
        AND: [
          { defaultAgentId: agentId },
          {
            name: {
              in: graphNames,
            },
          },
        ],
      },
    });

    await lunarkAgent.destroy();

    res.json({
      success: true,
      message: `${result.count} chat(s) deleted successfully`,
      deletedCount: result.count,
    });
  } catch (error: any) {
    console.error('Error deleting chats:', error);
    res.status(500).json({
      error: 'Failed to delete chats',
      message: error.message,
    });
  }
});
