import { ethers } from 'ethers';
import { ToolDefinition } from './types';
import { ERC20_ABI } from '../config/abi';
import { getRpcUrl, getExplorerUrl } from '../config/networks';
import { getToken } from '../config/tokens';
import { getIO } from '../socket/socket';
import db from '../db/client';

// Well-known protocol addresses
const PROTOCOL_ADDRESSES: Record<string, Record<number, string>> = {
  uniswap: {
    1: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', // Universal Router
    137: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    42161: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    10: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    8453: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
  },
  aave: {
    1: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2', // Pool V3
    137: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    42161: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    10: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    43114: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
  },
  sushiswap: {
    1: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F',
    137: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
    42161: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
  },
};

// Resolve spender: can be address or protocol name
function resolveSpender(spender: string, chainId: number): { address: string; protocol?: string } {
  // Check if it's already a valid address
  if (ethers.isAddress(spender)) {
    return { address: spender };
  }

  // Try to resolve as protocol name
  const lowerSpender = String(spender).toLowerCase();
  const protocol = PROTOCOL_ADDRESSES[lowerSpender];

  if (protocol && protocol[chainId]) {
    return { address: protocol[chainId], protocol: spender };
  }

  throw new Error(
    `Could not resolve spender "${spender}". Please provide a valid contract address or protocol name (uniswap, aave, sushiswap).`
  );
}

// Common token aliases
const TOKEN_ALIASES: Record<string, string> = {
  'dollar': 'USDC',
  'dolar': 'USDC',
  'usd': 'USDC',
  '$': 'USDC',
  'tether': 'USDT',
  'bitcoin': 'WBTC',
  'btc': 'WBTC',
};

// Resolve token: can be symbol or contract address
function resolveToken(
  tokenInput: string,
  chainId: number
): { address: string; symbol: string; decimals: number } {
  // Check if it's already a contract address
  if (ethers.isAddress(tokenInput)) {
    return { address: tokenInput, symbol: 'TOKEN', decimals: 18 };
  }

  // Normalize and check aliases
  const normalizedInput = String(tokenInput).toLowerCase().trim();
  const resolvedSymbol = TOKEN_ALIASES[normalizedInput] || tokenInput;

  // Try to resolve as known token symbol
  const token = getToken(resolvedSymbol, chainId);
  if (token) {
    return { address: token.address, symbol: resolvedSymbol.toUpperCase(), decimals: token.decimals };
  }

  throw new Error(
    `Token "${tokenInput}" not found on this network. Please provide the token contract address.`
  );
}

export const approveTool: ToolDefinition = {
  name: 'approve_token',
  description:
    'Prepare a token approval transaction for user confirmation. Sets ERC20 token spending allowance for a contract or protocol (e.g., Uniswap, Aave).',
  parameters: {
    token: {
      name: 'token',
      type: 'string',
      description: 'Token symbol (e.g., USDC, DAI) or contract address',
      required: true,
    },
    spender: {
      name: 'spender',
      type: 'string',
      description: 'Contract address or protocol name (uniswap, aave, sushiswap) to approve',
      required: true,
    },
    amount: {
      name: 'amount',
      type: 'string',
      description: 'Amount to approve (use "unlimited" or "max" for maximum approval)',
      required: true,
    },
  },
  handler: async (params, context) => {
    const { token: tokenInput, spender: spenderInput, amount } = params as {
      token: string;
      spender: string;
      amount: string;
    };

    const userAddress = context?.userAddress;
    const chainId = context?.chainId || 1;
    const chatId = context?.chatId;

    if (!userAddress) {
      return {
        success: false,
        error: 'User address not available. Please connect your wallet.',
      };
    }

    try {
      // Resolve token
      const tokenInfo = resolveToken(tokenInput, chainId);

      // Resolve spender
      const { address: spenderAddress, protocol } = resolveSpender(spenderInput, chainId);

      const provider = new ethers.JsonRpcProvider(getRpcUrl(chainId));
      const contract = new ethers.Contract(tokenInfo.address, ERC20_ABI, provider);

      // Fetch actual decimals and symbol from contract
      let tokenSymbol = tokenInfo.symbol;
      let tokenDecimals = tokenInfo.decimals;

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

      // Calculate approval amount
      let amountWei: bigint;
      let displayAmount: string;

      if (amount.toLowerCase() === 'unlimited' || amount.toLowerCase() === 'max') {
        amountWei = ethers.MaxUint256;
        displayAmount = 'unlimited';
      } else if (amount === '0' || amount.toLowerCase() === 'revoke') {
        amountWei = BigInt(0);
        displayAmount = '0 (revoke)';
      } else {
        amountWei = ethers.parseUnits(amount, tokenDecimals);
        displayAmount = amount;
      }

      // Encode approve function call
      const approveData = contract.interface.encodeFunctionData('approve', [
        spenderAddress,
        amountWei,
      ]);

      const transaction = {
        to: tokenInfo.address,
        value: '0x0',
        data: approveData,
        chainId,
      };

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

      const spenderDisplay = protocol || spenderAddress;
      const buttonText =
        displayAmount === '0 (revoke)'
          ? `Revoke ${tokenSymbol} approval`
          : `Approve ${displayAmount} ${tokenSymbol}`;

      const details = {
        from: userAddress,
        token: tokenInfo.address,
        tokenSymbol,
        spender: spenderAddress,
        spenderName: protocol,
        amount: displayAmount,
      };

      // Save transaction to database
      const savedTx = await db.transaction.create({
        data: {
          chatId: chatId || '',
          userId: user.id,
          type: 'approve',
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
          type: 'approve',
          transaction,
          details,
          buttonText,
          explorerUrl: getExplorerUrl(chainId),
        });

      } catch (socketError: any) {
        console.error('Failed to emit approval request:', socketError.message);
      }

      // Build response message for the LLM
      const spenderDisplayFull = protocol ? `${protocol} (${spenderAddress})` : spenderAddress;

      return {
        success: true,
        data: {
          message: `Approval prepared: ${displayAmount} ${tokenSymbol} for ${spenderDisplayFull}`,
          pendingApproval: true,
          transaction: {
            type: 'approve',
            from: userAddress,
            token: tokenInfo.address,
            tokenSymbol,
            spender: spenderAddress,
            spenderName: protocol,
            amount: displayAmount,
            chainId,
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
