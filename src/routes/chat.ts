import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import db from '../db/client';
import { UsageTracker } from '../services/usage';

export const chatRoutes = Router();

// Create new chat (graph-based conversation)
chatRoutes.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userAddress = req.userAddress!;
    const { message, userId, chainId } = req.body;

    // Verify user exists
    const user = await db.user.findFirst({
      where: {
        address: userAddress,
        deletedAt: null,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check balance before creating chat
    const usageTracker = new UsageTracker();
    const estimatedCost = usageTracker.estimateCost('gpt-4o-mini', message || '', 500);

    console.log(`💰 Balance check (chat creation):`, {
      userId: user.id,
      currentBalance: user.balance,
      estimatedCost,
      hasEnoughBalance: user.balance >= estimatedCost,
    });

    if (user.balance < estimatedCost) {
      return res.status(402).json({
        error: 'Insufficient balance',
        message: 'Your balance is too low to create a chat. Please add balance to continue.',
        currentBalance: user.balance,
        estimatedCost,
      });
    }

    // For now, we'll return a simple chat ID that can be used with the socket
    // The actual graph will be created by the agent system when processing the first message
    const chatId = `chat_${Date.now()}_${user.id.substring(0, 8)}`;

    res.json({
      success: true,
      chatId,
      message: 'Chat session created. Send your message to start the conversation.',
    });
  } catch (error: any) {
    console.error('Error creating chat:', error);
    res.status(500).json({
      error: 'Failed to create chat',
      message: error.message,
    });
  }
});

// Get all graphs (chat sessions) for user
chatRoutes.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
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

    // SECURITY: Initialize agent to get agentId for this specific user
    const { LunarkAgent } = await import('../agents/lunark-agent');
    const lunarkAgent = new LunarkAgent(userAddress);
    await lunarkAgent.initialize();
    const astreusAgent = lunarkAgent.getAgent();

    if (!astreusAgent) {
      return res.status(500).json({ error: 'Failed to initialize agent' });
    }

    const agentId = astreusAgent.id;

    // SECURITY: Only get graphs that belong to THIS user's agent
    const graphs = await db.graphs.findMany({
      where: {
        defaultAgentId: agentId,
      },
      orderBy: { updated_at: 'desc' },
      take: 50,
    });

    await lunarkAgent.destroy();

    res.json({
      success: true,
      chats: graphs.map((graph: typeof graphs[0]) => ({
        id: graph.id.toString(),
        title: graph.name || 'Conversation',
        createdAt: graph.created_at,
        updatedAt: graph.updated_at,
        status: graph.status,
      })),
    });
  } catch (error: any) {
    console.error('Error getting chats:', error);
    res.status(500).json({
      error: 'Failed to get chats',
      message: error.message,
    });
  }
});

// Get chat by ID (graph with tasks)
chatRoutes.get('/:chatId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { chatId } = req.params;
    const userAddress = req.userAddress!;

    // Verify user
    const user = await db.user.findFirst({
      where: {
        address: userAddress,
        deletedAt: null,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get tasks through Astreus Graph API for efficient query
    const { LunarkAgent } = await import('../agents/lunark-agent');
    const lunarkAgent = new LunarkAgent(userAddress);
    await lunarkAgent.initialize();
    const astreusAgent = lunarkAgent.getAgent();

    if (!astreusAgent) {
      await lunarkAgent.destroy();
      return res.status(500).json({ error: 'Failed to initialize agent' });
    }

    const agentId = astreusAgent.id;

    // SECURITY: Check if this chat belongs to this user
    // Graph name format: "Chat-{chatId}"
    const graphName = `Chat-${chatId}`;
    const dbGraph = await db.graphs.findFirst({
      where: {
        name: graphName,
      },
    });

    if (!dbGraph) {
      await lunarkAgent.destroy();
      return res.status(404).json({ error: 'Chat not found' });
    }

    // SECURITY: Verify ownership - graph must belong to THIS user's agent
    if (dbGraph.defaultAgentId !== agentId) {
      await lunarkAgent.destroy();
      return res.status(403).json({ error: 'Access denied - this chat does not belong to you' });
    }

    // Get graph for this chat
    const graph = await lunarkAgent.getOrCreateGraph(chatId);

    // Get tasks directly from graph (efficient query with graphId filter)
    const tasks = (await graph.getTasks({ limit: 100 }) as any[])
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    console.log(`Found ${tasks.length} tasks for chat ${chatId} via graph.getTasks()`);

    // Fetch all transactions for this chat (graceful degradation if table doesn't exist)
    let transactions: any[] = [];
    try {
      transactions = await db.transaction.findMany({
        where: { chatId },
        orderBy: { createdAt: 'asc' },
      });
    } catch (txError: any) {
      // Table might not exist yet - continue without transactions
      console.warn(`Could not fetch transactions for chat ${chatId}:`, txError.message);
    }

    // Format tasks as messages (both user and assistant)
    const messages = tasks.flatMap(task => {
      const msgs: any[] = [];

      // User message - use originalMessage from metadata if available (to avoid showing full context)
      const userMessage = task.metadata?.originalMessage || task.prompt;
      msgs.push({
        id: `${task.id}_user`,
        chatId,
        role: 'user',
        content: userMessage,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      });

      // Assistant message (if response exists)
      if (task.response) {
        const assistantCreatedAt = task.completedAt || task.updatedAt;

        // Find transaction created during this task (between task start and completion)
        const matchingTx = transactions.find(tx => {
          const txTime = tx.createdAt.getTime();
          const taskStart = task.createdAt.getTime();
          const taskEnd = assistantCreatedAt.getTime();
          return txTime >= taskStart && txTime <= taskEnd + 5000; // 5 second buffer
        });

        // Format transaction to match frontend ITransaction interface
        const formattedTx = matchingTx ? {
          id: matchingTx.id,
          hash: matchingTx.hash,
          status: matchingTx.status,
          type: matchingTx.type,
          data: {
            transaction: {
              to: matchingTx.to,
              value: matchingTx.value,
              data: matchingTx.data,
              chainId: matchingTx.chainId,
            },
            details: matchingTx.details as Record<string, any> || {},
            buttonText: matchingTx.buttonText,
            chainId: matchingTx.chainId,
          },
          userId: matchingTx.userId,
          messageId: `${task.id}_assistant`,
          createdAt: matchingTx.createdAt,
          updatedAt: matchingTx.updatedAt,
        } : null;

        // Remove matched transaction from array to avoid duplicate assignment
        if (matchingTx) {
          const txIndex = transactions.findIndex(tx => tx.id === matchingTx.id);
          if (txIndex > -1) {
            transactions.splice(txIndex, 1);
          }
        }

        msgs.push({
          id: `${task.id}_assistant`,
          chatId,
          role: 'lunark',
          content: task.response,
          feedback: task.metadata?.feedback || null,
          transaction: formattedTx,
          createdAt: assistantCreatedAt,
          updatedAt: task.updatedAt,
        });
      }

      return msgs;
    });

    // Cleanup agent
    await lunarkAgent.destroy();

    res.json({
      success: true,
      id: chatId,
      userId: user.id,
      title: 'Conversation',
      createdAt: tasks[0]?.created_at || new Date(),
      updatedAt: tasks[tasks.length - 1]?.updated_at || new Date(),
      messages,
    });
  } catch (error: any) {
    console.error('Error getting chat:', error);
    res.status(500).json({
      error: 'Failed to get chat',
      message: error.message,
    });
  }
});

// Delete chat (graph)
chatRoutes.delete('/:chatId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { chatId } = req.params;
    const userAddress = req.userAddress!;

    // Verify user
    const user = await db.user.findFirst({
      where: {
        address: userAddress,
        deletedAt: null,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // SECURITY: Initialize agent to get agentId for this specific user
    const { LunarkAgent } = await import('../agents/lunark-agent');
    const lunarkAgent = new LunarkAgent(userAddress);
    await lunarkAgent.initialize();
    const astreusAgent = lunarkAgent.getAgent();

    if (!astreusAgent) {
      await lunarkAgent.destroy();
      return res.status(500).json({ error: 'Failed to initialize agent' });
    }

    const agentId = astreusAgent.id;

    // SECURITY: Check if this chat belongs to this user
    // chatId can be either numeric graph ID or string chat ID
    // Check if chatId is a UUID (direct graph ID) or a chat ID format
    let dbGraph;

    // Try as direct graph ID first (UUID string)
    dbGraph = await db.graphs.findFirst({
      where: { id: chatId },
    });

    if (!dbGraph) {
      // If not found, try as chat ID format
      const graphName = `Chat-${chatId}`;
      dbGraph = await db.graphs.findFirst({
        where: { name: graphName },
      });
    }

    if (!dbGraph) {
      await lunarkAgent.destroy();
      return res.status(404).json({ error: 'Chat not found' });
    }

    // SECURITY: Verify ownership - graph must belong to THIS user's agent
    if (dbGraph.defaultAgentId !== agentId) {
      await lunarkAgent.destroy();
      return res.status(403).json({ error: 'Access denied - this chat does not belong to you' });
    }

    // Delete the graph (cascade will handle related nodes/edges/tasks)
    await db.graphs.delete({
      where: { id: dbGraph.id },
    });

    await lunarkAgent.destroy();

    res.json({
      success: true,
      message: 'Chat deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting chat:', error);
    res.status(500).json({
      error: 'Failed to delete chat',
      message: error.message,
    });
  }
});
