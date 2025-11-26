import { Agent, Graph } from '@astreus-ai/astreus';
import { agentConfig } from '../config/agent';
import { lunarkPlugin } from '../tools';
import db from '../db/client';
import { UsageTracker } from '../services/usage';
import { getNetworkInfo } from '../utils/networks';
import { NETWORKS } from '../config/networks';

// Singleton agent cache per user
const agentCache = new Map<string, { agent: Agent; lastUsed: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Cleanup old agents periodically
setInterval(() => {
  const now = Date.now();
  for (const [userAddress, cached] of agentCache.entries()) {
    if (now - cached.lastUsed > CACHE_TTL) {
      agentCache.delete(userAddress);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

export class LunarkAgent {
  private agent: Agent | null = null;
  private userAddress: string;
  private chainId: number;
  private currentChatId: string | undefined;
  private graphs: Map<string, Graph> = new Map();
  private usageTracker: UsageTracker;

  constructor(userAddress: string, chainId?: number) {
    this.userAddress = userAddress;
    this.chainId = chainId || 1; // Default to Ethereum Mainnet
    this.usageTracker = new UsageTracker();
  }

  // Getter for currentChatId (used by tool handlers)
  getChatId(): string | undefined {
    return this.currentChatId;
  }

  async initialize(): Promise<void> {
    if (this.agent) return;

    // Check cache first - but skip if chainId changed
    const cached = agentCache.get(this.userAddress);
    if (cached && cached.agent) {
      // Check if agent's chainId matches current chainId by inspecting system prompt
      const cachedSystemPrompt = (cached.agent as any).systemPrompt || '';
      const expectedChainIdText = `Chain ID: ${this.chainId}`;

      if (cachedSystemPrompt.includes(expectedChainIdText)) {
        this.agent = cached.agent;
        cached.lastUsed = Date.now();
        return;
      } else {
        agentCache.delete(this.userAddress);
      }
    }

    // Create new agent with unique name per user
    // This ensures each user has their own agent with separate tasks and memory
    // The agent knows the user's address and connected network through its system prompt
    const networkInfo = getNetworkInfo(this.chainId);

    // Build supported networks list for system prompt
    const supportedNetworksList = Object.values(NETWORKS)
      .map(net => `  • ${net.name} (Chain ID: ${net.chainId}) - ${net.symbol}`)
      .join('\n');

    this.agent = await Agent.create({
      name: `lunark-agent-${this.userAddress.slice(0, 10)}`, // e.g., "lunark-agent-0x12345678"
      model: agentConfig.model,
      memory: false,
      systemPrompt: `${agentConfig.systemPrompt}

IMPORTANT - Current User Context:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
User Wallet Address: ${this.userAddress}
Connected Network: ${networkInfo.name} (Chain ID: ${this.chainId})
Native Token: ${networkInfo.nativeToken} (${networkInfo.symbol})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This is YOUR user. When performing blockchain operations, checking balances, transferring tokens,
or referencing "my wallet", "my address", or "my tokens", ALWAYS use this address: ${this.userAddress}

IMPORTANT - Balance Tool Selection:
- "my balance" / "platform balance" → Use get_wallet_balance (Lunark USD balance)
- "wallet balance" / "ETH balance" / "crypto balance" → Use get_balance (${networkInfo.symbol} on ${networkInfo.name})

The user is currently connected to ${networkInfo.name}. When checking blockchain balance, use get_balance to check ${networkInfo.symbol} balance on this network.

SUPPORTED BLOCKCHAIN NETWORKS:
You can switch between these networks using the switch_network tool:
${supportedNetworksList}

When a user asks to switch networks (e.g., "switch to BSC", "change to Polygon"), use the switch_network tool with the corresponding chain ID from the list above.

Remember this address and network throughout the entire conversation - they represent the current user you are serving.`,
    });

    // Register tools with user context (address + chainId + agent instance + chatId)
    for (const tool of lunarkPlugin.tools) {
      const toolWithContext = {
        ...tool,
        handler: async (params: Record<string, unknown>) => {
          const result = await tool.handler(params, {
            userAddress: this.userAddress,
            chainId: this.chainId,
            agent: this, // Pass LunarkAgent instance for network switching
            chatId: this.currentChatId, // Pass current chat ID for socket emissions
          });
          return JSON.parse(JSON.stringify(result));
        },
      };

      await this.agent.registerPlugin({
        name: `${lunarkPlugin.name}-${tool.name}`,
        version: lunarkPlugin.version,
        description: tool.description,
        tools: [toolWithContext as never],
      });
    }

    // Cache the agent
    agentCache.set(this.userAddress, {
      agent: this.agent,
      lastUsed: Date.now(),
    });
  }

  getAgent(): Agent | null {
    return this.agent;
  }

  async ask(message: string, chatId?: string): Promise<AsyncGenerator<string, void, unknown>> {
    if (!this.agent) await this.initialize();

    // Set current chat ID for tool context
    this.currentChatId = chatId;

    // Use graph system for proper encryption and task management
    if (chatId) {
      return this.streamResponse(message, chatId);
    } else {
      // Fallback to direct response if no chatId provided
      return this.streamDirectResponse(message);
    }
  }

  private async *streamDirectResponse(message: string): AsyncGenerator<string, void, unknown> {
    if (!this.agent) throw new Error('Agent not initialized');

    const stream = await this.agent.ask(message, { stream: true });

    for await (const chunk of stream) {
      if (typeof chunk === 'string') {
        yield chunk;
      } else if (chunk && typeof chunk === 'object') {
        const objChunk = chunk as any;

        if ('content' in objChunk) {
          yield objChunk.content as string;
        } else if ('delta' in objChunk && objChunk.delta) {
          yield objChunk.delta as string;
        } else if ('text' in objChunk) {
          yield objChunk.text as string;
        }
      }
    }
  }

  async getOrCreateGraph(chatId: string): Promise<Graph> {
    if (this.graphs.has(chatId)) {
      return this.graphs.get(chatId)!;
    }

    // Check database for existing graph (any status - could be idle, active, failed)
    // Order by ID descending to get the most recent graph if multiple exist
    const dbGraph = await db.graphs.findFirst({
      where: {
        name: `Chat-${chatId}`,
      },
      orderBy: {
        id: 'desc',
      },
    });

    let graph: Graph;

    if (dbGraph) {
      // SECURITY: Verify that this graph belongs to THIS user's agent
      if (dbGraph.defaultAgentId !== this.agent!.id) {
        throw new Error(
          `Access denied: Chat ${chatId} does not belong to user ${this.userAddress}`
        );
      }

      try {
        const loadedGraph = await Graph.findById(dbGraph.id, this.agent!);
        if (loadedGraph) {
          graph = loadedGraph;

          // If graph is in failed state, reset it to idle for retry
          if (graph.getStatus() === 'failed') {
            graph.setStatus('idle');
            await graph.update();
          }
        } else {
          graph = await this.createNewGraph(chatId);
        }
      } catch (err) {
        graph = await this.createNewGraph(chatId);
      }
    } else {
      graph = await this.createNewGraph(chatId);
    }

    this.graphs.set(chatId, graph);
    return graph;
  }

  private async createNewGraph(chatId: string): Promise<Graph> {
    const graph = new Graph(
      {
        name: `Chat-${chatId}`,
        description: `Conversation graph for chat ${chatId}`,
        autoLink: true, // Auto-link messages sequentially to create conversation flow edges
      },
      this.agent!
    );

    await graph.save();
    return graph;
  }

  private async *streamResponse(
    message: string,
    chatId: string
  ): AsyncGenerator<string, void, unknown> {
    const chunks: string[] = [];
    let isComplete = false;
    let error: Error | null = null;

    const graph = await this.getOrCreateGraph(chatId);

    // Get conversation history from previous tasks in this graph
    const previousTasks = (await graph.getTasks({ limit: 20 }) as any[])
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    // Build conversation context from previous messages
    let conversationContext = '';
    if (previousTasks.length > 0) {
      const recentTasks = previousTasks.slice(-10); // Last 10 exchanges
      conversationContext = recentTasks
        .map(task => {
          // Use originalMessage from metadata if available to avoid nested history
          const userMsg = task.metadata?.originalMessage || task.prompt;
          let exchange = `User: ${userMsg}`;
          if (task.response) {
            exchange += `\nAssistant: ${task.response}`;
          }
          return exchange;
        })
        .join('\n\n');

      conversationContext = `--- CONVERSATION HISTORY ---\n${conversationContext}\n--- END HISTORY ---\n\nCurrent message from user: ${message}`;
    } else {
      conversationContext = message;
    }

    graph.addTaskNode({
      name: `Message-${Date.now()}`,
      prompt: conversationContext,
      model: agentConfig.model,
      stream: true,
      metadata: {
        chatId: chatId,
        userAddress: this.userAddress,
        originalMessage: message, // Store original for display
      },
    });

    const graphPromise = graph
      .run({
        stream: true,
        onChunk: (chunk: string) => {
          chunks.push(chunk);
        },
      })
      .then(async result => {
        try {
          await graph.update();

          // Track usage from graph execution
          if (result && result.usage && result.usage.totalTokens > 0) {
            await this.trackGraphUsage(result.usage, chatId);
          }
        } catch (updateErr) {
          console.error(`❌ Failed to update graph for chat ${chatId}:`, updateErr);
          throw updateErr;
        }
        isComplete = true;
      })
      .catch(err => {
        console.error(`❌ Graph execution or update failed for chat ${chatId}:`, err);
        error = err;
        isComplete = true;
      });

    let lastIndex = 0;
    while (!isComplete || lastIndex < chunks.length) {
      if (error) {
        throw error;
      }

      while (lastIndex < chunks.length) {
        yield chunks[lastIndex];
        lastIndex++;
      }

      if (!isComplete) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    await graphPromise;
  }

  /**
   * Track usage from graph execution and update user balance
   */
  private async trackGraphUsage(usage: any, chatId: string): Promise<void> {
    try {
      // Get user ID from address
      const user = await db.user.findFirst({
        where: {
          address: this.userAddress,
          deletedAt: null,
        },
      });

      if (!user) {
        return;
      }

      // Track usage for each node separately
      for (const [nodeId, nodeUsage] of Object.entries(usage.nodeUsages)) {
        const nu = nodeUsage as {
          promptTokens: number;
          completionTokens: number;
          totalTokens: number;
          model?: string;
        };

        await this.usageTracker.trackUsage(
          user.id,
          this.agent!.id,
          nu.model || agentConfig.model,
          {
            promptTokens: nu.promptTokens,
            completionTokens: nu.completionTokens,
            totalTokens: nu.totalTokens,
          },
          'response'
        );
      }

    } catch (error) {
      // Don't throw - usage tracking failure shouldn't break the chat
    }
  }

  /**
   * Update the connected network (chain ID)
   * Note: We only update the chainId without re-initializing the agent
   * to avoid breaking tool chains. The new chainId will be used by subsequent tool calls.
   */
  async switchNetwork(newChainId: number): Promise<void> {
    if (this.chainId === newChainId) {
      return;
    }

    this.chainId = newChainId;
    // Don't reset the agent - just update chainId
    // Tool handlers read chainId at call time, so they'll use the new value
  }

  /**
   * Get current chain ID
   */
  getChainId(): number {
    return this.chainId;
  }

  /**
   * Get current network information
   */
  getNetworkInfo() {
    return getNetworkInfo(this.chainId);
  }

  async destroy(): Promise<void> {
    // Don't actually destroy the agent - it's cached
    // Just clear local references
    this.agent = null;
    this.graphs.clear();
  }

  // Static method to clear specific user's cache
  static clearCache(userAddress: string): void {
    agentCache.delete(userAddress);
  }

  // Static method to clear all cache
  static clearAllCache(): void {
    agentCache.clear();
  }
}
