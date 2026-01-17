import { ethers } from 'ethers';
import { ToolDefinition } from './types';
import { ERC20_ABI } from '../config/abi';
import { getRpcUrl, getExplorerUrl, getNativeSymbol, getNetwork } from '../config/networks';
import { getToken, isNativeToken } from '../config/tokens';
import { getIO } from '../socket/socket';
import db from '../db/client';

// Resolve recipient: can be address, contact name, or ENS
async function resolveRecipient(
  recipient: string,
  userAddress: string,
  chainId: number
): Promise<{ address: string; resolvedFrom?: string }> {
  // Check if it's already a valid address
  if (ethers.isAddress(recipient)) {
    return { address: recipient };
  }

  // Try to resolve as contact name
  const user = await db.user.findUnique({
    where: { address: userAddress },
    include: {
      contacts: {
        where: { deletedAt: null },
      },
    },
  });

  if (user) {
    const contact = user.contacts.find(
      (c: { name: string }) => c.name.toLowerCase() === String(recipient).toLowerCase()
    );
    if (contact) {
      return { address: contact.address, resolvedFrom: `contact "${contact.name}"` };
    }
  }

  // Try to resolve as ENS name (only on networks that support ENS)
  if (String(recipient).endsWith('.eth') && [1, 11155111].includes(chainId)) {
    try {
      const provider = new ethers.JsonRpcProvider(getRpcUrl(chainId));
      const ensAddress = await provider.resolveName(recipient);
      if (ensAddress) {
        return { address: ensAddress, resolvedFrom: `ENS "${recipient}"` };
      }
    } catch {
      // ENS resolution failed, continue
    }
  }

  throw new Error(
    `Could not resolve recipient "${recipient}". Please provide a valid address, contact name, or ENS name.`
  );
}

// Common token aliases
const TOKEN_ALIASES: Record<string, string> = {
  'dollar': 'USDC',
  'dolar': 'USDC',
  'usd': 'USDC',
  '$': 'USDC',
  'tether': 'USDT',
  'ether': 'ETH',
  'bitcoin': 'WBTC',
  'btc': 'WBTC',
};

// Resolve token: can be symbol or contract address
function resolveToken(
  tokenInput: string | undefined,
  chainId: number
): { address: string | null; symbol: string; decimals: number } {
  // If no token specified, it's native token
  if (!tokenInput) {
    return { address: null, symbol: getNativeSymbol(chainId), decimals: 18 };
  }

  // Check if it's already a contract address
  if (ethers.isAddress(tokenInput)) {
    return { address: tokenInput, symbol: 'TOKEN', decimals: 18 }; // Decimals will be fetched on-chain
  }

  // Normalize and check aliases
  const normalizedInput = String(tokenInput).toLowerCase().trim();
  const resolvedSymbol = TOKEN_ALIASES[normalizedInput] || tokenInput;

  // Check if it's a native token symbol
  if (isNativeToken(resolvedSymbol, chainId)) {
    return { address: null, symbol: getNativeSymbol(chainId), decimals: 18 };
  }

  // Try to resolve as known token symbol
  const token = getToken(resolvedSymbol, chainId);
  if (token) {
    return { address: token.address, symbol: resolvedSymbol.toUpperCase(), decimals: token.decimals };
  }

  throw new Error(
    `Token "${tokenInput}" not found on this network. Please provide the token contract address.`
  );
}

// Network name to chainId mapping
const NETWORK_NAMES: Record<string, number> = {
  'ethereum': 1, 'eth': 1, 'mainnet': 1,
  'polygon': 137, 'matic': 137,
  'arbitrum': 42161, 'arb': 42161,
  'optimism': 10, 'op': 10,
  'base': 8453,
  'avalanche': 43114, 'avax': 43114,
  'bsc': 56, 'bnb': 56,
  'sepolia': 11155111,
};

export const transferTool: ToolDefinition = {
  name: 'transfer',
  description:
    'Prepare a token transfer transaction. Supports network switching, contact resolution, and ENS. Use this for ALL transfer requests.',
  parameters: {
    to: {
      name: 'to',
      type: 'string',
      description: 'Recipient: wallet address, contact name, or ENS name',
      required: true,
    },
    amount: {
      name: 'amount',
      type: 'string',
      description: 'Amount to transfer (e.g., "1.5" for 1.5 tokens)',
      required: true,
    },
    token: {
      name: 'token',
      type: 'string',
      description:
        'Token symbol (e.g., ETH, USDC, DAI) or contract address. Leave empty for native token.',
      required: false,
    },
    network: {
      name: 'network',
      type: 'string',
      description:
        'Network name (ethereum, polygon, arbitrum, optimism, base, avalanche, bsc, sepolia) or chain ID. If specified, will switch network before transfer.',
      required: false,
    },
  },
  handler: async (params, context) => {
    const { to, amount, token: tokenInput, network } = params as {
      to: string;
      amount: string;
      token?: string;
      network?: string;
    };

    const userAddress = context?.userAddress;
    let chainId = context?.chainId || 1;
    const chatId = context?.chatId;
    const agent = context?.agent;

    if (!userAddress) {
      return {
        success: false,
        error: 'User address not available. Please connect your wallet.',
      };
    }

    try {
      // Handle network switching if specified
      if (network) {
        const networkLower = String(network).toLowerCase();
        const targetChainId = NETWORK_NAMES[networkLower] || parseInt(network);

        if (!isNaN(targetChainId) && targetChainId !== chainId) {
          const networkInfo = getNetwork(targetChainId);
          if (!networkInfo) {
            return {
              success: false,
              error: `Unknown network: ${network}. Supported: ethereum, polygon, arbitrum, optimism, base, avalanche, bsc, sepolia`,
            };
          }

          // Switch agent's network
          if (agent && typeof agent.switchNetwork === 'function') {
            await agent.switchNetwork(targetChainId);
          }

          // Notify frontend to switch wallet network
          const normalizedAddress = userAddress.toLowerCase();
          try {
            const io = getIO();
            io.to(`user:${normalizedAddress}`).emit('networkSwitch', {
              chainId: networkInfo.chainId,
              name: networkInfo.name,
              symbol: networkInfo.symbol,
              rpcUrl: networkInfo.rpcUrl,
              explorerUrl: networkInfo.explorerUrl,
            });
          } catch (socketError: any) {
            // Don't fail if socket emit fails
          }

          chainId = targetChainId;
        }
      }

      // Resolve recipient
      const { address: recipientAddress, resolvedFrom } = await resolveRecipient(
        to,
        userAddress,
        chainId
      );

      // Resolve token
      const tokenInfo = resolveToken(tokenInput, chainId);

      const provider = new ethers.JsonRpcProvider(getRpcUrl(chainId));

      let transaction: {
        to: string;
        value: string;
        data: string;
        chainId: number;
      };
      let tokenSymbol = tokenInfo.symbol;
      let tokenDecimals = tokenInfo.decimals;

      if (tokenInfo.address) {
        // ERC20 transfer
        const contract = new ethers.Contract(tokenInfo.address, ERC20_ABI, provider);

        // Fetch actual decimals and symbol from contract
        try {
          const [decimals, symbol] = await Promise.all([
            contract.decimals(),
            contract.symbol(),
          ]);
          tokenDecimals = Number(decimals);
          tokenSymbol = symbol;
        } catch {
          // Use defaults if fetching fails
        }

        const amountWei = ethers.parseUnits(amount, tokenDecimals);

        // Check user's token balance before proceeding
        try {
          const balance = await contract.balanceOf(userAddress);
          if (balance < amountWei) {
            const balanceFormatted = ethers.formatUnits(balance, tokenDecimals);
            return {
              success: false,
              error: `Insufficient ${tokenSymbol} balance. You have ${balanceFormatted} ${tokenSymbol}, but trying to send ${amount} ${tokenSymbol}.`,
            };
          }
        } catch (balanceError) {
          // Continue if balance check fails - transaction will fail on-chain if insufficient
        }

        // Encode ERC20 transfer function call
        const transferData = contract.interface.encodeFunctionData('transfer', [
          recipientAddress,
          amountWei,
        ]);

        transaction = {
          to: tokenInfo.address,
          value: '0x0',
          data: transferData,
          chainId,
        };
      } else {
        // Native token transfer
        const amountWei = ethers.parseEther(amount);

        // Check user's native balance before proceeding
        try {
          const balance = await provider.getBalance(userAddress);
          if (balance < amountWei) {
            const balanceFormatted = ethers.formatEther(balance);
            return {
              success: false,
              error: `Insufficient ${tokenSymbol} balance. You have ${balanceFormatted} ${tokenSymbol}, but trying to send ${amount} ${tokenSymbol}.`,
            };
          }
        } catch (balanceError) {
          // Continue if balance check fails
        }

        transaction = {
          to: recipientAddress,
          value: ethers.toQuantity(amountWei),
          data: '0x',
          chainId,
        };
      }

      // Get user ID for database
      const user = await db.user.findUnique({
        where: { address: userAddress },
      });

      if (!user) {
        return {
          success: false,
          error: 'User not found',
        };
      }

      const buttonText = `Send ${amount} ${tokenSymbol}`;
      const details = {
        from: userAddress,
        to: recipientAddress,
        amount,
        symbol: tokenSymbol,
        tokenAddress: tokenInfo.address,
        resolvedFrom,
      };

      // Save transaction to database
      const savedTx = await db.transaction.create({
        data: {
          chatId: chatId || '',
          userId: user.id,
          type: 'transfer',
          status: 'pending',
          chainId,
          to: transaction.to,
          value: transaction.value,
          data: transaction.data,
          buttonText,
          details,
        },
      });

      // Emit transaction request to frontend via socket
      const normalizedAddress = userAddress.toLowerCase();
      try {
        const io = getIO();

        io.to(`user:${normalizedAddress}`).emit('pendingTransaction', {
          id: savedTx.id,
          chatId,
          type: 'transfer',
          transaction,
          details,
          buttonText,
          explorerUrl: getExplorerUrl(chainId),
        });
      } catch (socketError: any) {
        console.error('Failed to emit transaction request:', socketError.message);
      }

      // Build response message for the LLM
      const recipientDisplay = resolvedFrom
        ? `${recipientAddress} (${resolvedFrom})`
        : recipientAddress;

      return {
        success: true,
        data: {
          message: `Transfer prepared: ${amount} ${tokenSymbol} to ${recipientDisplay}`,
          pendingApproval: true,
          transaction: {
            type: 'transfer',
            from: userAddress,
            to: recipientAddress,
            amount,
            symbol: tokenSymbol,
            tokenAddress: tokenInfo.address,
            chainId,
            resolvedFrom,
          },
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
};
