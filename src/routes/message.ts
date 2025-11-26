import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import db from '../db/client';
import { getIO } from '../socket/socket';
import { LunarkAgent } from '../agents/lunark-agent';
import { UsageTracker } from '../services/usage';

export const messageRoutes = Router();

// Send message and get AI response
messageRoutes.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userAddress = req.userAddress!;
    const { chatId, content, userId, chainId } = req.body;

    if (!chatId || !content) {
      return res.status(400).json({ error: 'chatId and content are required' });
    }

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

    // Check balance before processing message
    const usageTracker = new UsageTracker();
    const estimatedCost = usageTracker.estimateCost('gpt-4o-mini', content, 500);

    console.log(`💰 Balance check:`, {
      userId: user.id,
      currentBalance: user.balance,
      estimatedCost,
      hasEnoughBalance: user.balance >= estimatedCost,
    });

    if (user.balance < estimatedCost) {
      return res.status(402).json({
        error: 'Insufficient balance',
        message: 'Your balance is too low to process this request. Please add balance to continue.',
        currentBalance: user.balance,
        estimatedCost,
      });
    }

    // Send immediate response to acknowledge
    const messageId = Date.now().toString();
    res.json({
      success: true,
      messageId,
      message: 'Message received and processing started',
    });

    // Get socket.io instance
    const io = getIO();

    // Emit stream status
    io.to(`chat:${chatId}`).emit('streamStatus', {
      status: 'Lunark is thinking...',
    });

    // Initialize Lunark agent with connected network
    const agent = new LunarkAgent(userAddress, chainId);
    await agent.initialize();

    // Get streaming response from agent
    let fullResponse = '';

    try {
      const responseStream = await agent.ask(content, chatId);

      for await (const chunk of responseStream) {
        fullResponse += chunk;

        // Emit every chunk immediately for smooth streaming
        io.to(`chat:${chatId}`).emit('streamResponse', {
          chatId,
          messageId,
          message: fullResponse,
          role: 'lunark',
          userId: user.id,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (agentError: any) {
      console.error('❌ Agent streaming error:', {
        error: agentError.message,
        stack: agentError.stack,
        chatId,
        userAddress,
      });

      // Send user-friendly response
      if (!fullResponse) {
        fullResponse =
          "I've processed your request, but I'm having trouble generating a response right now. The operation may have completed successfully. Please try asking again or rephrase your question.";
        io.to(`chat:${chatId}`).emit('streamResponse', {
          chatId,
          messageId,
          message: fullResponse,
          role: 'lunark',
          userId: user.id,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Note: Graph system handles everything automatically:
    // 1. agent.ask(content, chatId) → streamResponse()
    // 2. graph.addTaskNode() → adds node to graph
    // 3. graph.run() → executeNode() → Task.createTask() with auto-encryption ✅
    // No manual task creation needed!

    // Emit stream end via socket
    io.to(`chat:${chatId}`).emit('streamEnd', {
      chatId,
      messageId,
    });

    // Cleanup agent
    await agent.destroy();
  } catch (error: any) {
    console.error('Error processing message:', error);

    // Try to emit error via socket
    try {
      const io = getIO();
      io.to(`chat:${req.body.chatId}`).emit('streamError', {
        error: 'Failed to process message',
        chatId: req.body.chatId,
      });
    } catch (socketError) {
      console.error('Failed to emit socket error:', socketError);
    }

    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to process message',
        message: error.message,
      });
    }
  }
});

// Get messages for a chat (from tasks)
messageRoutes.get('/:chatId', authenticateToken, async (req: AuthRequest, res: Response) => {
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

    // Get or create agent to access tasks
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
    const tasks = await graph.getTasks({ limit: 100 }) as any[];
    console.log(`📋 Found ${tasks.length} tasks for chat ${chatId} via graph.getTasks()`);

    // Format tasks as messages
    const messages = tasks.flatMap(task => [
      {
        id: `${task.id}_user`,
        chatId,
        role: 'user',
        content: task.prompt,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      },
      ...(task.response
        ? [
            {
              id: `${task.id}_assistant`,
              chatId,
              role: 'lunark',
              content: task.response,
              createdAt: task.completedAt || task.updatedAt,
              updatedAt: task.updatedAt,
            },
          ]
        : []),
    ]);

    // Cleanup
    await lunarkAgent.destroy();

    res.json({
      success: true,
      messages,
    });
  } catch (error: any) {
    console.error('Error getting messages:', error);
    res.status(500).json({
      error: 'Failed to get messages',
      message: error.message,
    });
  }
});

// Submit feedback for a message
messageRoutes.post('/feedback', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userAddress = req.userAddress!;
    const { messageId, feedback, content } = req.body;

    if (!messageId || !feedback || !content) {
      return res.status(400).json({ error: 'messageId, feedback, and content are required' });
    }

    if (!['liked', 'disliked'].includes(feedback)) {
      return res.status(400).json({ error: 'feedback must be "liked" or "disliked"' });
    }

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

    // Extract task ID from message ID
    // Format can be: "taskId_assistant" or just a timestamp string
    let taskId: string;

    if (messageId.includes('_')) {
      // Format: taskId_assistant or taskId_user (taskId is now a UUID string)
      taskId = messageId.split('_')[0];
    } else {
      // It's just a timestamp, we can't find the task
      // Return success without doing anything since this is a temporary message
      return res.json({ success: true, message: 'Feedback noted (temporary message)' });
    }

    if (!taskId || taskId.trim() === '') {
      return res.status(400).json({ error: 'Invalid message ID format' });
    }

    // Get the task to update its metadata
    const task = await db.tasks.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Update task metadata with feedback
    const updatedMetadata = {
      ...((task.metadata as object) || {}),
      feedback: feedback,
    };

    await db.tasks.update({
      where: { id: taskId },
      data: {
        metadata: updatedMetadata,
      },
    });

    // Create agent to save feedback memory
    const lunarkAgent = new LunarkAgent(userAddress);
    await lunarkAgent.initialize();
    const astreusAgent = lunarkAgent.getAgent();

    if (!astreusAgent) {
      return res.status(500).json({ error: 'Failed to initialize agent' });
    }

    // Save feedback as a memory through Astreus API (automatically encrypted)
    const memory = await astreusAgent.addMemory(content, {
      type: 'user_feedback',
      feedback: feedback,
      messageId: messageId,
      taskId: taskId,
      userId: user.id,
      timestamp: new Date().toISOString(),
    });

    // Cleanup
    await lunarkAgent.destroy();

    res.json({
      success: true,
      message: 'Feedback saved successfully',
      memoryId: memory.id,
    });
  } catch (error: any) {
    console.error('Error saving feedback:', error);
    res.status(500).json({
      error: 'Failed to save feedback',
      message: error.message,
    });
  }
});
