/**
 * Network information and utilities
 */

export interface NetworkInfo {
  chainId: number;
  name: string;
  nativeToken: string;
  symbol: string;
  rpcUrl?: string;
}

export const SUPPORTED_NETWORKS: Record<number, NetworkInfo> = {
  1: {
    chainId: 1,
    name: 'Ethereum Mainnet',
    nativeToken: 'Ether',
    symbol: 'ETH',
  },
  56: {
    chainId: 56,
    name: 'BNB Smart Chain',
    nativeToken: 'BNB',
    symbol: 'BNB',
  },
  137: {
    chainId: 137,
    name: 'Polygon',
    nativeToken: 'MATIC',
    symbol: 'MATIC',
  },
  42161: {
    chainId: 42161,
    name: 'Arbitrum One',
    nativeToken: 'Ether',
    symbol: 'ETH',
  },
  10: {
    chainId: 10,
    name: 'Optimism',
    nativeToken: 'Ether',
    symbol: 'ETH',
  },
  8453: {
    chainId: 8453,
    name: 'Base',
    nativeToken: 'Ether',
    symbol: 'ETH',
  },
  43114: {
    chainId: 43114,
    name: 'Avalanche C-Chain',
    nativeToken: 'AVAX',
    symbol: 'AVAX',
  },
  250: {
    chainId: 250,
    name: 'Fantom Opera',
    nativeToken: 'FTM',
    symbol: 'FTM',
  },
  // Testnets
  11155111: {
    chainId: 11155111,
    name: 'Sepolia Testnet',
    nativeToken: 'Sepolia Ether',
    symbol: 'ETH',
  },
  97: {
    chainId: 97,
    name: 'BNB Smart Chain Testnet',
    nativeToken: 'Test BNB',
    symbol: 'tBNB',
  },
  80001: {
    chainId: 80001,
    name: 'Mumbai Testnet',
    nativeToken: 'Test MATIC',
    symbol: 'MATIC',
  },
};

/**
 * Get network information by chain ID
 */
export function getNetworkInfo(chainId: number): NetworkInfo {
  return (
    SUPPORTED_NETWORKS[chainId] || {
      chainId,
      name: `Unknown Network (${chainId})`,
      nativeToken: 'Unknown',
      symbol: '???',
    }
  );
}

/**
 * Get network name by chain ID
 */
export function getNetworkName(chainId: number): string {
  return getNetworkInfo(chainId).name;
}

/**
 * Get native token symbol by chain ID
 */
export function getNativeTokenSymbol(chainId: number): string {
  return getNetworkInfo(chainId).symbol;
}

/**
 * Check if a chain ID is supported
 */
export function isNetworkSupported(chainId: number): boolean {
  return chainId in SUPPORTED_NETWORKS;
}
