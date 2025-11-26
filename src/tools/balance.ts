import { ethers } from 'ethers';
import { ToolDefinition } from './types';
import { ERC20_ABI } from '../config/abi';
import { getRpcUrl, getNativeSymbol } from '../config/networks';
import { getToken, isNativeToken } from '../config/tokens';

export const balanceTool: ToolDefinition = {
  name: 'get_balance',
  description: 'Get token balance of a wallet address. Accepts token symbol (USDC, USDT, DAI, ETH, etc.) or contract address. If no token specified, returns native token balance.',
  parameters: {
    address: {
      name: 'address',
      type: 'string',
      description: 'Wallet address to check balance (optional, uses connected wallet if not specified)',
      required: false,
    },
    token: {
      name: 'token',
      type: 'string',
      description: 'Token symbol (USDC, USDT, DAI, ETH) or contract address. Leave empty for native token.',
      required: false,
    },
  },
  handler: async (params, context) => {
    const { token } = params as {
      address?: string;
      token?: string;
    };

    // Use user's address if not explicitly provided
    const address = (params.address as string) || context?.userAddress;
    if (!address) {
      return {
        success: false,
        error: 'No wallet address provided and no connected wallet found.',
      };
    }

    // Use context chainId
    const chainId = context?.chainId || 1;

    // Resolve token to address if it's a symbol
    let tokenAddress: string | null = null;
    let resolvedSymbol: string | null = null;

    if (token) {
      // Check if it's a native token symbol
      if (isNativeToken(token, chainId)) {
        tokenAddress = null; // Native token
        resolvedSymbol = getNativeSymbol(chainId);
      } else if (ethers.isAddress(token)) {
        // It's already a contract address
        tokenAddress = token;
      } else {
        // Try to resolve as token symbol
        const tokenInfo = getToken(token, chainId);
        if (tokenInfo) {
          tokenAddress = tokenInfo.address;
          resolvedSymbol = String(token).toUpperCase();
        } else {
          return {
            success: false,
            error: `Token "${token}" not found on this network. Please provide a valid token symbol or contract address.`,
          };
        }
      }
    }

    const provider = new ethers.JsonRpcProvider(getRpcUrl(chainId));

    try {
      if (tokenAddress) {
        const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        const [balance, decimals, symbol, name] = await Promise.all([
          contract.balanceOf(address),
          contract.decimals(),
          contract.symbol(),
          contract.name(),
        ]);

        const formattedBalance = ethers.formatUnits(balance, decimals);

        return {
          success: true,
          data: {
            balance: formattedBalance,
            symbol,
            name,
            tokenAddress,
            raw: balance.toString(),
          },
        };
      } else {
        const balance = await provider.getBalance(address);
        const formattedBalance = ethers.formatEther(balance);

        return {
          success: true,
          data: {
            balance: formattedBalance,
            symbol: getNativeSymbol(chainId),
            raw: balance.toString(),
          },
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
};
