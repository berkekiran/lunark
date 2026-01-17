import { ToolDefinition } from './types';
import { getNetwork, SUPPORTED_CHAINS, getNativeSymbol } from '../config/networks';
import { getIO } from '../socket/socket';
import { getToken, getTokensForChain, isNativeToken as checkIsNativeToken, getSupportedTokenSymbols } from '../config/tokens';

export const resolveTokenTool: ToolDefinition = {
  name: 'resolve_token',
  description: 'Find token contract address by symbol on a specific blockchain. Returns the token address and details.',
  parameters: {
    symbol: {
      name: 'symbol',
      type: 'string',
      description: 'Token symbol (e.g., USDC, WETH, DAI)',
      required: true,
    },
  },
  handler: async (params, context) => {
    const { symbol } = params as { symbol: string };
    const chainId = context?.chainId || 1;

    try {
      const network = getNetwork(chainId);
      if (!network) {
        return {
          success: false,
          error: `Unsupported chain ID: ${chainId}`,
        };
      }

      // Check if it's a native token
      if (checkIsNativeToken(symbol, chainId)) {
        return {
          success: true,
          data: {
            symbol: symbol.toUpperCase(),
            name: `${network.name} Native Token`,
            address: null, // Native tokens don't have contract addresses
            decimals: 18,
            isNative: true,
            network: network.name,
          },
        };
      }

      // Try to find token in our database
      const token = getToken(symbol, chainId);
      if (token) {
        return {
          success: true,
          data: {
            symbol: symbol.toUpperCase(),
            name: token.name,
            address: token.address,
            decimals: token.decimals,
            isNative: false,
            network: network.name,
          },
        };
      }

      // Token not found - provide helpful message
      const availableTokens = getTokensForChain(chainId);
      const availableSymbols = availableTokens.map(t => t.symbol).join(', ');

      return {
        success: false,
        error: `Token "${symbol}" not found on ${network.name}. Available tokens: ${availableSymbols || 'none configured'}. You can also provide a token contract address directly.`,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

export const isNativeTokenTool: ToolDefinition = {
  name: 'is_native_token',
  description:
    'Check if a token symbol represents the native token (ETH, BNB, MATIC, etc.) of a blockchain',
  parameters: {
    symbol: {
      name: 'symbol',
      type: 'string',
      description: 'Token symbol to check',
      required: true,
    },
  },
  handler: async (params, context) => {
    const { symbol } = params as { symbol: string };
    const chainId = context?.chainId || 1;

    const network = getNetwork(chainId);

    if (!network) {
      return {
        success: false,
        error: `Unsupported chain ID: ${chainId}`,
      };
    }

    const isNative = checkIsNativeToken(symbol, chainId);

    return {
      success: true,
      data: {
        isNative,
        nativeSymbol: network.symbol,
        networkName: network.name,
      },
    };
  },
};

export const switchNetworkTool: ToolDefinition = {
  name: 'switch_network',
  description: 'Switch to a different blockchain network. Can optionally check a token balance after switching.',
  parameters: {
    chainId: {
      name: 'chainId',
      type: 'number',
      description: 'Target blockchain network ID to switch to',
      required: true,
    },
    checkToken: {
      name: 'checkToken',
      type: 'string',
      description: 'Optional: Token symbol to check balance after switching (e.g., "USDC", "ETH")',
      required: false,
    },
  },
  handler: async (params, context) => {
    const { chainId, checkToken } = params as { chainId: number; checkToken?: string };
    const agent = context?.agent;
    const userAddress = context?.userAddress;

    const network = getNetwork(chainId);

    if (!network) {
      return {
        success: false,
        error: `Unsupported chain ID: ${chainId}`,
        supportedChains: SUPPORTED_CHAINS,
      };
    }

    try {
      // Switch agent's network (updates chainId)
      if (agent && typeof agent.switchNetwork === 'function') {
        await agent.switchNetwork(chainId);
      }

      // Notify frontend via socket to switch network in wallet
      const normalizedAddress = userAddress?.toLowerCase();
      try {
        const io = getIO();
        if (normalizedAddress) {
          io.to(`user:${normalizedAddress}`).emit('networkSwitch', {
            chainId: network.chainId,
            name: network.name,
            symbol: network.symbol,
            rpcUrl: network.rpcUrl,
            explorerUrl: network.explorerUrl,
          });
        }
      } catch (socketError: any) {
        // Don't fail the tool if socket emit fails
      }

      // If checkToken is provided, also get the balance
      let balanceInfo = null;
      if (checkToken && userAddress) {
        try {
          const { ethers } = await import('ethers');
          const { getRpcUrl } = await import('../config/networks');
          const { getToken, isNativeToken } = await import('../config/tokens');
          const { ERC20_ABI } = await import('../config/abi');

          const provider = new ethers.JsonRpcProvider(getRpcUrl(chainId));

          if (isNativeToken(checkToken, chainId)) {
            // Native token balance
            const balance = await provider.getBalance(userAddress);
            balanceInfo = {
              token: network.symbol,
              balance: ethers.formatEther(balance),
              isNative: true,
            };
          } else {
            // ERC20 token balance
            const tokenInfo = getToken(checkToken, chainId);
            if (tokenInfo) {
              const contract = new ethers.Contract(tokenInfo.address, ERC20_ABI, provider);
              const [balance, decimals, symbol] = await Promise.all([
                contract.balanceOf(userAddress),
                contract.decimals(),
                contract.symbol(),
              ]);
              balanceInfo = {
                token: symbol,
                balance: ethers.formatUnits(balance, decimals),
                address: tokenInfo.address,
                isNative: false,
              };
            } else {
              balanceInfo = {
                error: `Token ${checkToken} not found on ${network.name}`,
              };
            }
          }
        } catch (balanceError: any) {
          balanceInfo = {
            error: `Failed to get balance: ${balanceError.message}`,
          };
        }
      }

      const result: any = {
        success: true,
        data: {
          network: {
            chainId: network.chainId,
            name: network.name,
            symbol: network.symbol,
          },
          message: `Switched to ${network.name}.`,
        },
      };

      if (balanceInfo) {
        result.data.balance = balanceInfo;
        if (balanceInfo.error) {
          result.data.message += ` ${balanceInfo.error}`;
        } else {
          result.data.message += ` Your ${balanceInfo.token} balance: ${balanceInfo.balance}`;
        }
      }

      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to switch network',
      };
    }
  },
};

export const listToolsTool: ToolDefinition = {
  name: 'list_tools',
  description: 'List all available tools and their capabilities',
  parameters: {},
  handler: async () => {
    return {
      success: true,
      data: {
        tools: [
          {
            name: 'transfer',
            description: 'Transfer tokens (ERC20 or native) to an address',
            category: 'blockchain',
          },
          {
            name: 'get_balance',
            description: 'Get token balance of a wallet address',
            category: 'blockchain',
          },
          {
            name: 'approve_token',
            description: 'Approve an ERC20 token for spending',
            category: 'blockchain',
          },
          {
            name: 'resolve_token',
            description: 'Find token contract address by symbol',
            category: 'blockchain',
          },
          {
            name: 'is_native_token',
            description: 'Check if token is native to blockchain',
            category: 'blockchain',
          },
          {
            name: 'switch_network',
            description: 'Get network information for switching',
            category: 'blockchain',
          },
          {
            name: 'add_contact',
            description: 'Add a new contact to address book',
            category: 'contacts',
          },
          {
            name: 'list_contacts',
            description: 'List all saved contacts',
            category: 'contacts',
          },
          {
            name: 'resolve_contact',
            description: 'Find contact wallet address by name',
            category: 'contacts',
          },
          {
            name: 'delete_contact',
            description: 'Remove a contact from address book',
            category: 'contacts',
          },
          {
            name: 'list_tools',
            description: 'List all available tools',
            category: 'system',
          },
        ],
        totalTools: 11,
        categories: ['blockchain', 'contacts', 'system'],
      },
    };
  },
};

// storeMemoryTool removed - memory is now handled by Astreus agent system
