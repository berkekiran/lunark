// DEX Protocol configurations with router addresses for each supported network

export interface DexConfig {
  name: string;
  slug: string;
  routerAddress: Record<number, string>;
  quoterAddress?: Record<number, string>;
  factoryAddress?: Record<number, string>;
  website: string;
  supportedChains: number[];
}

// Uniswap V3 addresses
export const UNISWAP: DexConfig = {
  name: 'Uniswap',
  slug: 'uniswap',
  routerAddress: {
    1: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',      // Ethereum - SwapRouter02
    42161: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',  // Arbitrum
    137: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',    // Polygon
    10: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',     // Optimism
    8453: '0x2626664c2603336E57B271c5C0b26F421741e481',   // Base - Universal Router
    56: '0xB971eF87ede563556b2ED4b1C0b0019111Dd85d2',     // BNB Chain
    43114: '0xbb00FF08d01D300023C629E8fFfFcb65A5a578cE',  // Avalanche
    11155111: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E', // Sepolia Testnet
  },
  quoterAddress: {
    1: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    42161: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    137: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    10: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    8453: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
    56: '0x78D78E420Da98ad378D7799bE8f4AF69033EB077',
    43114: '0xbe0F5544EC67e9B3b2D979aaA43f18Fd87E6257F',
    11155111: '0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3', // Sepolia Testnet
  },
  website: 'https://uniswap.org',
  supportedChains: [1, 42161, 137, 10, 8453, 56, 43114, 11155111],
};

// SushiSwap V2 addresses
export const SUSHISWAP: DexConfig = {
  name: 'SushiSwap',
  slug: 'sushiswap',
  routerAddress: {
    1: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F',      // Ethereum
    42161: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',  // Arbitrum
    137: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',    // Polygon
    10: '0x4C5D5234f232BD2D76B96aA33F5AE4FCF0E4BFAb',     // Optimism
    56: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',     // BNB Chain
    43114: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',  // Avalanche
  },
  factoryAddress: {
    1: '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac',
    42161: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
    137: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
    10: '0xFbc12984689e5f15626Bad03Ad60160Fe98B303C',
    56: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
    43114: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
  },
  website: 'https://sushi.com',
  supportedChains: [1, 42161, 137, 10, 56, 43114],
};

// Curve Finance addresses
export const CURVE: DexConfig = {
  name: 'Curve',
  slug: 'curve',
  routerAddress: {
    1: '0x99a58482BD75cbab83b27EC03CA68fF489b5788f',      // Ethereum - Router
    42161: '0xF0d4c12A5768D806021F80a262B4d39d26C58b8D',  // Arbitrum
    137: '0xF0d4c12A5768D806021F80a262B4d39d26C58b8D',    // Polygon
    10: '0x0DCDED3545D565bA3B19E683431381007245d983',     // Optimism
    43114: '0x0DCDED3545D565bA3B19E683431381007245d983',  // Avalanche
  },
  website: 'https://curve.fi',
  supportedChains: [1, 42161, 137, 10, 43114],
};

// PancakeSwap (primarily for BNB Chain)
export const PANCAKESWAP: DexConfig = {
  name: 'PancakeSwap',
  slug: 'pancakeswap',
  routerAddress: {
    56: '0x10ED43C718714eb63d5aA57B78B54704E256024E',     // BNB Chain V2
    1: '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4',      // Ethereum
    42161: '0x8cFe327CEc66d1C090Dd72bd0FF11d690C33a2Eb',  // Arbitrum
  },
  factoryAddress: {
    56: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',
    1: '0x1097053Fd2ea711dad45caCcc45EfF7548fCB362',
    42161: '0x02a84c1b3BBD7401a5f7fa98a384EBC70bB5749E',
  },
  website: 'https://pancakeswap.finance',
  supportedChains: [56, 1, 42161],
};

// TraderJoe (primarily for Avalanche)
export const TRADERJOE: DexConfig = {
  name: 'TraderJoe',
  slug: 'traderjoe',
  routerAddress: {
    43114: '0xb4315e873dBcf96Ffd0acd8EA43f689D8c20fB30', // Avalanche - LBRouter
    42161: '0xb4315e873dBcf96Ffd0acd8EA43f689D8c20fB30', // Arbitrum
  },
  website: 'https://traderjoexyz.com',
  supportedChains: [43114, 42161],
};

// All DEXes
export const DEX_PROTOCOLS: Record<string, DexConfig> = {
  uniswap: UNISWAP,
  sushiswap: SUSHISWAP,
  curve: CURVE,
  pancakeswap: PANCAKESWAP,
  traderjoe: TRADERJOE,
};

// Get DEX by name/slug
export function getDex(name: string): DexConfig | undefined {
  const lowerName = name.toLowerCase();
  return DEX_PROTOCOLS[lowerName];
}

// Get all DEXes available on a specific chain
export function getDexesForChain(chainId: number): DexConfig[] {
  return Object.values(DEX_PROTOCOLS).filter(dex =>
    dex.supportedChains.includes(chainId)
  );
}

// Get router address for a DEX on a specific chain
export function getRouterAddress(dexSlug: string, chainId: number): string | undefined {
  const dex = getDex(dexSlug);
  return dex?.routerAddress[chainId];
}

// Wrapped native token addresses (needed for swaps)
export const WRAPPED_NATIVE: Record<number, string> = {
  1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',      // WETH
  42161: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',  // WETH
  137: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',    // WMATIC
  10: '0x4200000000000000000000000000000000000006',     // WETH
  8453: '0x4200000000000000000000000000000000000006',   // WETH
  56: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',     // WBNB
  43114: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',  // WAVAX
  11155111: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', // WETH Sepolia
};

// Common swap fee tiers for Uniswap V3
export const FEE_TIERS = {
  LOWEST: 100,    // 0.01%
  LOW: 500,       // 0.05%
  MEDIUM: 3000,   // 0.3%
  HIGH: 10000,    // 1%
};

// Default slippage tolerance (in basis points, 50 = 0.5%)
export const DEFAULT_SLIPPAGE_BPS = 50;

// Swap deadline (20 minutes from now)
export const SWAP_DEADLINE_SECONDS = 20 * 60;
