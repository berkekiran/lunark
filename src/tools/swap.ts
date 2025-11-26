import { ethers } from 'ethers';
import { ToolDefinition } from './types';
import { ERC20_ABI } from '../config/abi';
import { getRpcUrl, getExplorerUrl } from '../config/networks';
import { getToken, isNativeToken, TOKENS } from '../config/tokens';
import {
  getDex,
  getDexesForChain,
  WRAPPED_NATIVE,
  DEFAULT_SLIPPAGE_BPS,
  SWAP_DEADLINE_SECONDS,
  FEE_TIERS,
  DexConfig,
} from '../config/dex';
import { getIO } from '../socket/socket';
import db from '../db/client';

// Uniswap V3 SwapRouter02 ABI (partial)
const UNISWAP_ROUTER_ABI = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
  'function exactInput((bytes path, address recipient, uint256 amountIn, uint256 amountOutMinimum)) external payable returns (uint256 amountOut)',
  'function multicall(uint256 deadline, bytes[] calldata data) external payable returns (bytes[] memory)',
];

// Uniswap V3 Quoter ABI (partial)
const QUOTER_ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
];

// SushiSwap/Uniswap V2 Router ABI (partial)
const V2_ROUTER_ABI = [
  'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)',
  'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
  'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
];

// Token aliases for common names
const TOKEN_ALIASES: Record<string, string> = {
  'dollar': 'USDC',
  'dolar': 'USDC',
  'usd': 'USDC',
  'tether': 'USDT',
  'bitcoin': 'WBTC',
  'btc': 'WBTC',
  'ether': 'ETH',
  'eth': 'ETH',
  'ethereum': 'ETH',
};

// Resolve token to address and info
function resolveToken(
  tokenInput: string,
  chainId: number
): { address: string; symbol: string; decimals: number; isNative: boolean } | null {
  // Check if it's already a contract address
  if (ethers.isAddress(tokenInput)) {
    return { address: tokenInput, symbol: 'TOKEN', decimals: 18, isNative: false };
  }

  // Normalize and check aliases
  const normalizedInput = String(tokenInput).toLowerCase().trim();
  const resolvedSymbol = TOKEN_ALIASES[normalizedInput] || String(tokenInput).toUpperCase();

  // Check if native token
  if (isNativeToken(resolvedSymbol, chainId)) {
    const wrappedAddress = WRAPPED_NATIVE[chainId];
    if (!wrappedAddress) return null;
    return {
      address: wrappedAddress,
      symbol: resolvedSymbol,
      decimals: 18,
      isNative: true,
    };
  }

  // Try to resolve as known token symbol
  const token = getToken(resolvedSymbol, chainId);
  if (token) {
    return {
      address: token.address,
      symbol: resolvedSymbol,
      decimals: token.decimals,
      isNative: false,
    };
  }

  return null;
}

// Get quote from Uniswap V3
async function getUniswapV3Quote(
  provider: ethers.Provider,
  quoterAddress: string,
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  fee: number = FEE_TIERS.MEDIUM
): Promise<bigint | null> {
  try {
    const quoter = new ethers.Contract(quoterAddress, QUOTER_ABI, provider);
    const result = await quoter.quoteExactInputSingle.staticCall({
      tokenIn,
      tokenOut,
      amountIn,
      fee,
      sqrtPriceLimitX96: 0,
    });
    return result.amountOut;
  } catch {
    return null;
  }
}

// Get quote from V2 style DEX (SushiSwap, PancakeSwap)
async function getV2Quote(
  provider: ethers.Provider,
  routerAddress: string,
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint
): Promise<bigint | null> {
  try {
    const router = new ethers.Contract(routerAddress, V2_ROUTER_ABI, provider);
    const amounts = await router.getAmountsOut(amountIn, [tokenIn, tokenOut]);
    return amounts[1];
  } catch {
    return null;
  }
}

interface SwapQuote {
  dex: DexConfig;
  amountOut: bigint;
  amountOutFormatted: string;
  priceImpact?: number;
}

// Get quotes from all available DEXes
async function getAllQuotes(
  provider: ethers.Provider,
  chainId: number,
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  tokenOutDecimals: number
): Promise<SwapQuote[]> {
  const dexes = getDexesForChain(chainId);
  const quotes: SwapQuote[] = [];

  for (const dex of dexes) {
    let amountOut: bigint | null = null;

    if (dex.slug === 'uniswap' && dex.quoterAddress?.[chainId]) {
      // Try different fee tiers for Uniswap V3
      for (const fee of [FEE_TIERS.MEDIUM, FEE_TIERS.LOW, FEE_TIERS.HIGH]) {
        amountOut = await getUniswapV3Quote(
          provider,
          dex.quoterAddress[chainId],
          tokenIn,
          tokenOut,
          amountIn,
          fee
        );
        if (amountOut && amountOut > 0n) break;
      }
    } else if (dex.routerAddress[chainId]) {
      // V2 style quote
      amountOut = await getV2Quote(
        provider,
        dex.routerAddress[chainId],
        tokenIn,
        tokenOut,
        amountIn
      );
    }

    if (amountOut && amountOut > 0n) {
      quotes.push({
        dex,
        amountOut,
        amountOutFormatted: ethers.formatUnits(amountOut, tokenOutDecimals),
      });
    }
  }

  // Sort by best output (highest amount)
  quotes.sort((a, b) => (b.amountOut > a.amountOut ? 1 : -1));

  return quotes;
}

// Build swap transaction data
function buildSwapTransaction(
  dex: DexConfig,
  chainId: number,
  tokenIn: { address: string; isNative: boolean },
  tokenOut: { address: string; isNative: boolean },
  amountIn: bigint,
  amountOutMin: bigint,
  recipient: string,
  deadline: number
): { to: string; data: string; value: string } {
  const routerAddress = dex.routerAddress[chainId];

  if (dex.slug === 'uniswap') {
    // Uniswap V3 exactInputSingle
    const router = new ethers.Interface(UNISWAP_ROUTER_ABI);

    const params = {
      tokenIn: tokenIn.address,
      tokenOut: tokenOut.address,
      fee: FEE_TIERS.MEDIUM,
      recipient: tokenOut.isNative ? ethers.ZeroAddress : recipient, // Use Zero for unwrap
      amountIn,
      amountOutMinimum: amountOutMin,
      sqrtPriceLimitX96: 0,
    };

    const swapData = router.encodeFunctionData('exactInputSingle', [params]);

    // Wrap in multicall with deadline
    const multicallData = router.encodeFunctionData('multicall', [deadline, [swapData]]);

    return {
      to: routerAddress,
      data: multicallData,
      value: tokenIn.isNative ? ethers.toQuantity(amountIn) : '0x0',
    };
  } else {
    // V2 style swap
    const router = new ethers.Interface(V2_ROUTER_ABI);
    const path = [tokenIn.address, tokenOut.address];

    let data: string;
    let value = '0x0';

    if (tokenIn.isNative) {
      data = router.encodeFunctionData('swapExactETHForTokens', [
        amountOutMin,
        path,
        recipient,
        deadline,
      ]);
      value = ethers.toQuantity(amountIn);
    } else if (tokenOut.isNative) {
      data = router.encodeFunctionData('swapExactTokensForETH', [
        amountIn,
        amountOutMin,
        path,
        recipient,
        deadline,
      ]);
    } else {
      data = router.encodeFunctionData('swapExactTokensForTokens', [
        amountIn,
        amountOutMin,
        path,
        recipient,
        deadline,
      ]);
    }

    return { to: routerAddress, data, value };
  }
}

export const swapTool: ToolDefinition = {
  name: 'swap_tokens',
  description:
    'Swap tokens on decentralized exchanges (Uniswap, SushiSwap, PancakeSwap, etc.). Finds best price across DEXes and prepares swap transaction for user confirmation.',
  parameters: {
    fromToken: {
      name: 'fromToken',
      type: 'string',
      description: 'Token to swap from (symbol like ETH, USDC or contract address)',
      required: true,
    },
    toToken: {
      name: 'toToken',
      type: 'string',
      description: 'Token to swap to (symbol like ETH, USDC or contract address)',
      required: true,
    },
    amount: {
      name: 'amount',
      type: 'string',
      description: 'Amount of fromToken to swap',
      required: true,
    },
    dex: {
      name: 'dex',
      type: 'string',
      description: 'Specific DEX to use (uniswap, sushiswap, pancakeswap). If not specified, finds best price.',
      required: false,
    },
    slippage: {
      name: 'slippage',
      type: 'string',
      description: 'Slippage tolerance in percent (default 0.5%)',
      required: false,
    },
  },
  handler: async (params, context) => {
    const {
      fromToken: fromTokenInput,
      toToken: toTokenInput,
      amount,
      dex: preferredDex,
      slippage: slippageInput,
    } = params as {
      fromToken: string;
      toToken: string;
      amount: string;
      dex?: string;
      slippage?: string;
    };

    const userAddress = context?.userAddress;
    const chainId = context?.chainId || 1;
    const chatId = context?.chatId;

    if (!userAddress) {
      return {
        success: false,
        error: 'Wallet not connected. Please connect your wallet first.',
      };
    }

    try {
      // Resolve tokens
      const fromToken = resolveToken(fromTokenInput, chainId);
      const toToken = resolveToken(toTokenInput, chainId);

      if (!fromToken) {
        return {
          success: false,
          error: `Token "${fromTokenInput}" not found on this network.`,
        };
      }

      if (!toToken) {
        return {
          success: false,
          error: `Token "${toTokenInput}" not found on this network.`,
        };
      }

      if (fromToken.address.toLowerCase() === toToken.address.toLowerCase()) {
        return {
          success: false,
          error: 'Cannot swap a token for itself.',
        };
      }

      // Parse amount
      const amountIn = ethers.parseUnits(amount, fromToken.decimals);

      // Parse slippage (default 0.5%)
      const slippageBps = slippageInput
        ? Math.round(parseFloat(slippageInput) * 100)
        : DEFAULT_SLIPPAGE_BPS;

      const provider = new ethers.JsonRpcProvider(getRpcUrl(chainId));

      // Check balance
      if (fromToken.isNative) {
        const balance = await provider.getBalance(userAddress);
        if (balance < amountIn) {
          return {
            success: false,
            error: `Insufficient ${fromToken.symbol} balance. You have ${ethers.formatEther(balance)} ${fromToken.symbol}.`,
          };
        }
      } else {
        const tokenContract = new ethers.Contract(fromToken.address, ERC20_ABI, provider);
        const balance = await tokenContract.balanceOf(userAddress);
        if (balance < amountIn) {
          return {
            success: false,
            error: `Insufficient ${fromToken.symbol} balance. You have ${ethers.formatUnits(balance, fromToken.decimals)} ${fromToken.symbol}.`,
          };
        }
      }

      // Get quotes
      let quotes: SwapQuote[];

      if (preferredDex) {
        const dex = getDex(preferredDex);
        if (!dex) {
          return {
            success: false,
            error: `DEX "${preferredDex}" not supported. Available: uniswap, sushiswap, pancakeswap, curve, traderjoe`,
          };
        }
        if (!dex.supportedChains.includes(chainId)) {
          return {
            success: false,
            error: `${dex.name} is not available on this network.`,
          };
        }
        quotes = await getAllQuotes(provider, chainId, fromToken.address, toToken.address, amountIn, toToken.decimals);
        quotes = quotes.filter(q => q.dex.slug === preferredDex);
      } else {
        quotes = await getAllQuotes(provider, chainId, fromToken.address, toToken.address, amountIn, toToken.decimals);
      }

      if (quotes.length === 0) {
        return {
          success: false,
          error: `No liquidity found for ${fromToken.symbol} → ${toToken.symbol} swap on this network.`,
        };
      }

      // Use best quote
      const bestQuote = quotes[0];

      // Calculate minimum output with slippage
      const amountOutMin = (bestQuote.amountOut * BigInt(10000 - slippageBps)) / BigInt(10000);

      // Calculate deadline
      const deadline = Math.floor(Date.now() / 1000) + SWAP_DEADLINE_SECONDS;

      // Check if approval is needed for non-native tokens
      let needsApproval = false;
      let currentAllowance = 0n;

      if (!fromToken.isNative) {
        const tokenContract = new ethers.Contract(fromToken.address, ERC20_ABI, provider);
        currentAllowance = await tokenContract.allowance(userAddress, bestQuote.dex.routerAddress[chainId]);
        needsApproval = currentAllowance < amountIn;
      }

      // Build swap transaction
      const swapTx = buildSwapTransaction(
        bestQuote.dex,
        chainId,
        fromToken,
        toToken,
        amountIn,
        amountOutMin,
        userAddress,
        deadline
      );

      // Get user from database
      const user = await db.user.findUnique({
        where: { address: userAddress },
      });

      if (!user) {
        return {
          success: false,
          error: 'User not found.',
        };
      }

      // Format output for display
      const amountOutFormatted = parseFloat(bestQuote.amountOutFormatted).toFixed(6);
      const amountOutMinFormatted = ethers.formatUnits(amountOutMin, toToken.decimals);
      const rate = parseFloat(bestQuote.amountOutFormatted) / parseFloat(amount);

      // Build response details
      const details = {
        from: userAddress,
        fromToken: fromToken.address,
        fromSymbol: fromToken.symbol,
        fromAmount: amount,
        toToken: toToken.address,
        toSymbol: toToken.symbol,
        toAmount: amountOutFormatted,
        toAmountMin: parseFloat(amountOutMinFormatted).toFixed(6),
        dex: bestQuote.dex.name,
        rate: rate.toFixed(6),
        slippage: `${slippageBps / 100}%`,
        needsApproval,
      };

      const buttonText = `Swap ${amount} ${fromToken.symbol} for ~${amountOutFormatted} ${toToken.symbol}`;

      // Save transaction to database
      const savedTx = await db.transaction.create({
        data: {
          chatId: chatId || '',
          userId: user.id,
          type: 'swap',
          status: 'pending',
          chainId,
          to: swapTx.to,
          value: swapTx.value,
          data: swapTx.data,
          buttonText,
          details,
        },
      });

      // Emit transaction request to frontend
      const normalizedAddress = userAddress.toLowerCase();
      try {
        const io = getIO();
        io.to(`user:${normalizedAddress}`).emit('pendingTransaction', {
          id: savedTx.id,
          chatId,
          type: 'swap',
          transaction: {
            to: swapTx.to,
            value: swapTx.value,
            data: swapTx.data,
            chainId,
          },
          details,
          buttonText,
          explorerUrl: getExplorerUrl(chainId),
          needsApproval,
          approvalData: needsApproval ? {
            token: fromToken.address,
            tokenSymbol: fromToken.symbol,
            spender: bestQuote.dex.routerAddress[chainId],
            spenderName: bestQuote.dex.name,
            amount: amountIn.toString(),
          } : undefined,
        });
      } catch (socketError: any) {
        console.error('Failed to emit swap request:', socketError.message);
      }

      // Build comparison text if multiple quotes
      let comparisonText = '';
      if (quotes.length > 1) {
        comparisonText = '\n\nOther quotes:\n' + quotes.slice(1, 4).map(q =>
          `• ${q.dex.name}: ${parseFloat(q.amountOutFormatted).toFixed(6)} ${toToken.symbol}`
        ).join('\n');
      }

      return {
        success: true,
        data: {
          message: `Swap prepared: ${amount} ${fromToken.symbol} → ~${amountOutFormatted} ${toToken.symbol} via ${bestQuote.dex.name}` +
            `\nRate: 1 ${fromToken.symbol} = ${rate.toFixed(6)} ${toToken.symbol}` +
            `\nMinimum received: ${parseFloat(amountOutMinFormatted).toFixed(6)} ${toToken.symbol} (${slippageBps / 100}% slippage)` +
            (needsApproval ? `\n\n⚠️ Token approval required for ${bestQuote.dex.name}` : '') +
            comparisonText,
          pendingSwap: true,
          swap: {
            type: 'swap',
            from: userAddress,
            fromToken: fromToken.symbol,
            fromAmount: amount,
            toToken: toToken.symbol,
            toAmount: amountOutFormatted,
            dex: bestQuote.dex.name,
            chainId,
            needsApproval,
          },
        },
      };
    } catch (error: any) {
      console.error('Swap error:', error);
      return {
        success: false,
        error: error.message || 'Failed to prepare swap.',
      };
    }
  },
};
