import express from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { ethers } from 'ethers';
import db from '../db/client';

const router = express.Router();

// ERC20 ABI for balanceOf
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
];

// Get native token balance (ETH, MATIC, etc.)
router.get('/native-balance', authenticateToken, async (req, res) => {
  try {
    const { address, chainId } = req.query;

    if (!address || !chainId) {
      return res.status(400).json({ error: 'address and chainId are required' });
    }

    // RPC URLs for different chains (with fallbacks)
    const rpcUrls: Record<number, string[]> = {
      1: [
        'https://ethereum-rpc.publicnode.com',
        'https://eth.llamarpc.com',
        'https://rpc.ankr.com/eth',
        'https://1rpc.io/eth',
      ],
      137: [
        'https://polygon-bor-rpc.publicnode.com',
        'https://polygon-rpc.com',
        'https://rpc.ankr.com/polygon',
        'https://1rpc.io/matic',
      ],
      56: [
        'https://bsc-dataseed1.bnbchain.org',
        'https://bsc.llamarpc.com',
        'https://rpc.ankr.com/bsc',
        'https://1rpc.io/bnb',
      ],
      43114: [
        'https://api.avax.network/ext/bc/C/rpc',
        'https://avalanche.drpc.org',
        'https://rpc.ankr.com/avalanche',
        'https://1rpc.io/avax/c',
      ],
      8453: [
        'https://base-rpc.publicnode.com',
        'https://mainnet.base.org',
        'https://base.llamarpc.com',
        'https://1rpc.io/base',
      ],
      42161: [
        'https://arb1.arbitrum.io/rpc',
        'https://rpc.ankr.com/arbitrum',
        'https://arbitrum-one.publicnode.com',
        'https://1rpc.io/arb',
      ],
      10: [
        'https://optimism-rpc.publicnode.com',
        'https://mainnet.optimism.io',
        'https://rpc.ankr.com/optimism',
        'https://1rpc.io/op',
      ],
      11155111: [
        'https://ethereum-sepolia-rpc.publicnode.com',
        'https://ethereum-sepolia.blockpi.network/v1/rpc/public',
        'https://rpc.ankr.com/eth_sepolia',
        'https://sepolia.drpc.org',
      ],
    };

    const networkNames: Record<number, { symbol: string; name: string }> = {
      1: { symbol: 'ETH', name: 'Ethereum' },
      137: { symbol: 'MATIC', name: 'Polygon' },
      56: { symbol: 'BNB', name: 'BNB Chain' },
      43114: { symbol: 'AVAX', name: 'Avalanche' },
      8453: { symbol: 'ETH', name: 'Base' },
      42161: { symbol: 'ETH', name: 'Arbitrum' },
      10: { symbol: 'ETH', name: 'Optimism' },
      11155111: { symbol: 'ETH', name: 'Sepolia' },
    };

    const chainIdNum = parseInt(chainId as string);
    const rpcList = rpcUrls[chainIdNum];

    if (!rpcList || rpcList.length === 0) {
      // Return empty balance instead of error for unsupported chains
      return res.json({
        symbol: 'ETH',
        name: 'Unknown Network',
        balance: '0',
        decimals: 18,
        address: 'native',
        icon: 'ETH.svg',
      });
    }

    // Try each RPC endpoint until one works
    let lastError: any = null;
    for (const rpcUrl of rpcList) {
      try {
        // Create network object with chainId to skip detection
        const network = ethers.Network.from({
          name: networkNames[chainIdNum]?.name || 'unknown',
          chainId: chainIdNum,
        });

        const provider = new ethers.JsonRpcProvider(rpcUrl, network, {
          staticNetwork: network,
          batchMaxCount: 1,
        });

        // Set timeout for RPC call
        const balancePromise = provider.getBalance(address as string);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('RPC timeout')), 2000)
        );

        const balance = (await Promise.race([balancePromise, timeoutPromise])) as bigint;
        const networkInfo = networkNames[chainIdNum];

        // Success! Return the balance
        return res.json({
          symbol: networkInfo.symbol,
          name: networkInfo.name,
          balance: ethers.formatEther(balance),
          decimals: 18,
          address: 'native',
          icon: `${networkInfo.symbol}.svg`,
        });
      } catch (rpcError: any) {
        lastError = rpcError;
        // Try next RPC immediately (no retry delay)
        continue;
      }
    }

    // All RPCs failed, return zero balance
    const networkInfo = networkNames[chainIdNum] || { symbol: 'ETH', name: 'Unknown' };
    res.json({
      symbol: networkInfo.symbol,
      name: networkInfo.name,
      balance: '0',
      decimals: 18,
      address: 'native',
      icon: `${networkInfo.symbol}.svg`,
    });
  } catch (error: any) {
    console.error('Get native balance error:', error);
    res.status(500).json({ error: 'Failed to get native balance' });
  }
});

// Token list for each chain
const TOKEN_LIST: Record<
  number,
  Array<{ address: string; symbol: string; name: string; decimals: number; icon: string }>
> = {
  1: [
    // Ethereum Mainnet
    {
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      icon: 'USDT.svg',
    },
    {
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      icon: 'USDC.svg',
    },
    {
      address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      symbol: 'DAI',
      name: 'Dai Stablecoin',
      decimals: 18,
      icon: 'DAI.svg',
    },
    {
      address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      symbol: 'WBTC',
      name: 'Wrapped BTC',
      decimals: 8,
      icon: 'WBTC.svg',
    },
    {
      address: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
      symbol: 'AAVE',
      name: 'Aave Token',
      decimals: 18,
      icon: 'AAVE.svg',
    },
    {
      address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
      symbol: 'UNI',
      name: 'Uniswap',
      decimals: 18,
      icon: 'UNI.svg',
    },
    {
      address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
      symbol: 'LINK',
      name: 'ChainLink Token',
      decimals: 18,
      icon: 'LINK.svg',
    },
  ],
  137: [
    // Polygon
    {
      address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      icon: 'USDT.svg',
    },
    {
      address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      icon: 'USDC.svg',
    },
    {
      address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
      symbol: 'DAI',
      name: 'Dai Stablecoin',
      decimals: 18,
      icon: 'DAI.svg',
    },
    {
      address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
      symbol: 'WBTC',
      name: 'Wrapped BTC',
      decimals: 8,
      icon: 'WBTC.svg',
    },
    {
      address: '0xD6DF932A45C0f255f85145f286eA0b292B21C90B',
      symbol: 'AAVE',
      name: 'Aave Token',
      decimals: 18,
      icon: 'AAVE.svg',
    },
  ],
  8453: [
    // Base
    {
      address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
      symbol: 'USDC',
      name: 'USD Base Coin',
      decimals: 6,
      icon: 'USDC.svg',
    },
    {
      address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
      symbol: 'DAI',
      name: 'Dai Stablecoin',
      decimals: 18,
      icon: 'DAI.svg',
    },
    {
      address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
      symbol: 'CBBTC',
      name: 'Coinbase Wrapped BTC',
      decimals: 8,
      icon: 'WBTC.svg',
    },
  ],
  42161: [
    // Arbitrum
    {
      address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      icon: 'USDT.svg',
    },
    {
      address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      icon: 'USDC.svg',
    },
    {
      address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
      symbol: 'DAI',
      name: 'Dai Stablecoin',
      decimals: 18,
      icon: 'DAI.svg',
    },
    {
      address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
      symbol: 'WBTC',
      name: 'Wrapped BTC',
      decimals: 8,
      icon: 'WBTC.svg',
    },
    {
      address: '0x912CE59144191C1204E64559FE8253a0e49E6548',
      symbol: 'ARB',
      name: 'Arbitrum',
      decimals: 18,
      icon: 'ARB.svg',
    },
  ],
  10: [
    // Optimism
    {
      address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      icon: 'USDT.svg',
    },
    {
      address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      icon: 'USDC.svg',
    },
    {
      address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
      symbol: 'DAI',
      name: 'Dai Stablecoin',
      decimals: 18,
      icon: 'DAI.svg',
    },
    {
      address: '0x68f180fcCe6836688e9084f035309E29Bf0A2095',
      symbol: 'WBTC',
      name: 'Wrapped BTC',
      decimals: 8,
      icon: 'WBTC.svg',
    },
    {
      address: '0x4200000000000000000000000000000000000042',
      symbol: 'OP',
      name: 'Optimism',
      decimals: 18,
      icon: 'OP.svg',
    },
  ],
  56: [
    // BNB Chain
    {
      address: '0x55d398326f99059fF775485246999027B3197955',
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 18,
      icon: 'USDT.svg',
    },
    {
      address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 18,
      icon: 'USDC.svg',
    },
    {
      address: '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3',
      symbol: 'DAI',
      name: 'Dai Stablecoin',
      decimals: 18,
      icon: 'DAI.svg',
    },
    {
      address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
      symbol: 'BTCB',
      name: 'Binance Bitcoin',
      decimals: 18,
      icon: 'WBTC.svg',
    },
    {
      address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
      symbol: 'CAKE',
      name: 'PancakeSwap Token',
      decimals: 18,
      icon: 'CAKE.svg',
    },
  ],
  43114: [
    // Avalanche
    {
      address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      icon: 'USDT.svg',
    },
    {
      address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      icon: 'USDC.svg',
    },
    {
      address: '0xd586E7F844cea2F87f50152665BCbc2C279D8d70',
      symbol: 'DAI',
      name: 'Dai Stablecoin',
      decimals: 18,
      icon: 'DAI.svg',
    },
    {
      address: '0x50b7545627a5162F82A992c33b87aDc75187B218',
      symbol: 'WBTC',
      name: 'Wrapped BTC',
      decimals: 8,
      icon: 'WBTC.svg',
    },
    {
      address: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
      symbol: 'WAVAX',
      name: 'Wrapped AVAX',
      decimals: 18,
      icon: 'AVAX.svg',
    },
  ],
  11155111: [], // Sepolia Testnet - No ERC20 tokens, only native ETH
};

// Get ERC20 token balances
router.get('/token-balances', authenticateToken, async (req, res) => {
  try {
    const { address, chainId } = req.query;

    if (!address || !chainId) {
      return res.status(400).json({ error: 'address and chainId are required' });
    }

    const chainIdNum = parseInt(chainId as string);
    const tokenList = TOKEN_LIST[chainIdNum] || [];

    if (tokenList.length === 0) {
      return res.json({ balances: [] });
    }

    // RPC URLs for different chains (reuse from native-balance endpoint)
    const rpcUrls: Record<number, string[]> = {
      1: [
        'https://eth.llamarpc.com',
        'https://rpc.ankr.com/eth',
        'https://ethereum.publicnode.com',
        'https://1rpc.io/eth',
      ],
      137: [
        'https://polygon-rpc.com',
        'https://rpc.ankr.com/polygon',
        'https://polygon-bor-rpc.publicnode.com',
        'https://1rpc.io/matic',
      ],
      8453: [
        'https://mainnet.base.org',
        'https://base.llamarpc.com',
        'https://base.publicnode.com',
        'https://1rpc.io/base',
      ],
      42161: [
        'https://arb1.arbitrum.io/rpc',
        'https://rpc.ankr.com/arbitrum',
        'https://arbitrum-one.publicnode.com',
        'https://1rpc.io/arb',
      ],
      10: [
        'https://mainnet.optimism.io',
        'https://rpc.ankr.com/optimism',
        'https://optimism.publicnode.com',
        'https://1rpc.io/op',
      ],
      56: [
        'https://bsc-dataseed1.bnbchain.org',
        'https://bsc.llamarpc.com',
        'https://rpc.ankr.com/bsc',
        'https://1rpc.io/bnb',
      ],
      43114: [
        'https://api.avax.network/ext/bc/C/rpc',
        'https://avalanche.drpc.org',
        'https://rpc.ankr.com/avalanche',
        'https://1rpc.io/avax/c',
      ],
      11155111: [
        'https://ethereum-sepolia.blockpi.network/v1/rpc/public',
        'https://rpc.ankr.com/eth_sepolia',
        'https://sepolia.drpc.org',
      ],
    };

    const networkNames: Record<number, { symbol: string; name: string }> = {
      1: { symbol: 'ETH', name: 'Ethereum' },
      137: { symbol: 'MATIC', name: 'Polygon' },
      8453: { symbol: 'ETH', name: 'Base' },
      42161: { symbol: 'ETH', name: 'Arbitrum' },
      10: { symbol: 'ETH', name: 'Optimism' },
      56: { symbol: 'BNB', name: 'BNB Chain' },
      43114: { symbol: 'AVAX', name: 'Avalanche' },
      11155111: { symbol: 'ETH', name: 'Sepolia' },
    };

    const rpcList = rpcUrls[chainIdNum];
    if (!rpcList || rpcList.length === 0) {
      return res.json({ balances: [] });
    }

    // Try to get a working provider
    let provider: ethers.JsonRpcProvider | null = null;
    for (const rpcUrl of rpcList) {
      try {
        const network = ethers.Network.from({
          name: networkNames[chainIdNum]?.name || 'unknown',
          chainId: chainIdNum,
        });

        const testProvider = new ethers.JsonRpcProvider(rpcUrl, network, {
          staticNetwork: network,
          batchMaxCount: 1,
        });

        // Quick test
        const testPromise = testProvider.getBlockNumber();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('RPC timeout')), 2000)
        );

        await Promise.race([testPromise, timeoutPromise]);
        provider = testProvider;
        break;
      } catch {
        continue;
      }
    }

    if (!provider) {
      return res.json({ balances: [] });
    }

    // Fetch balances for all tokens
    const balances = await Promise.all(
      tokenList.map(async token => {
        try {
          const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
          const balancePromise = contract.balanceOf(address as string);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Token balance timeout')), 2000)
          );

          const balance = (await Promise.race([balancePromise, timeoutPromise])) as bigint;
          const formattedBalance = ethers.formatUnits(balance, token.decimals);

          return {
            symbol: token.symbol,
            name: token.name,
            balance: formattedBalance,
            decimals: token.decimals,
            address: token.address,
            icon: token.icon,
          };
        } catch (error) {
          // Return zero balance on error
          return {
            symbol: token.symbol,
            name: token.name,
            balance: '0',
            decimals: token.decimals,
            address: token.address,
            icon: token.icon,
          };
        }
      })
    );

    res.json({ balances });
  } catch (error: any) {
    console.error('Get token balances error:', error);
    res.status(500).json({ error: 'Failed to get token balances' });
  }
});

// Update transaction status after user submits
router.patch('/transaction/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { status, hash } = req.body;
    const userAddress = req.userAddress!;

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

    // Find the transaction
    const transaction = await db.transaction.findUnique({
      where: { id },
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Verify ownership
    if (transaction.userId !== user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Update transaction
    const updatedTx = await db.transaction.update({
      where: { id },
      data: {
        status: status || transaction.status,
        hash: hash || transaction.hash,
      },
    });

    res.json({
      success: true,
      transaction: {
        id: updatedTx.id,
        status: updatedTx.status,
        hash: updatedTx.hash,
      },
    });
  } catch (error: any) {
    console.error('Update transaction error:', error);
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

// Get transaction by ID
router.get('/transaction/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userAddress = req.userAddress!;

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

    // Find the transaction
    const transaction = await db.transaction.findUnique({
      where: { id },
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Verify ownership
    if (transaction.userId !== user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      success: true,
      transaction: {
        id: transaction.id,
        chatId: transaction.chatId,
        type: transaction.type,
        status: transaction.status,
        hash: transaction.hash,
        chainId: transaction.chainId,
        to: transaction.to,
        value: transaction.value,
        data: transaction.data,
        buttonText: transaction.buttonText,
        details: transaction.details,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt,
      },
    });
  } catch (error: any) {
    console.error('Get transaction error:', error);
    res.status(500).json({ error: 'Failed to get transaction' });
  }
});

export default router;
