export interface NetworkConfig {
  chainId: number;
  name: string;
  symbol: string;
  rpcUrl: string;
  explorerUrl: string;
}

export const NETWORKS: Record<number, NetworkConfig> = {
  // Ethereum Mainnet
  1: {
    chainId: 1,
    name: 'Ethereum',
    symbol: 'ETH',
    rpcUrl: 'https://ethereum-rpc.publicnode.com',
    explorerUrl: 'https://etherscan.io',
  },
  // Arbitrum
  42161: {
    chainId: 42161,
    name: 'Arbitrum',
    symbol: 'ETH',
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    explorerUrl: 'https://arbiscan.io',
  },
  // Polygon
  137: {
    chainId: 137,
    name: 'Polygon',
    symbol: 'MATIC',
    rpcUrl: 'https://polygon-bor-rpc.publicnode.com',
    explorerUrl: 'https://polygonscan.com',
  },
  // BNB Chain
  56: {
    chainId: 56,
    name: 'BNB Chain',
    symbol: 'BNB',
    rpcUrl: 'https://bsc-dataseed1.bnbchain.org',
    explorerUrl: 'https://bscscan.com',
  },
  // Avalanche
  43114: {
    chainId: 43114,
    name: 'Avalanche',
    symbol: 'AVAX',
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
    explorerUrl: 'https://snowtrace.io',
  },
  // Optimism
  10: {
    chainId: 10,
    name: 'Optimism',
    symbol: 'ETH',
    rpcUrl: 'https://optimism-rpc.publicnode.com',
    explorerUrl: 'https://optimistic.etherscan.io',
  },
  // Base
  8453: {
    chainId: 8453,
    name: 'Base',
    symbol: 'ETH',
    rpcUrl: 'https://base-rpc.publicnode.com',
    explorerUrl: 'https://basescan.org',
  },
  // Sepolia Testnet
  11155111: {
    chainId: 11155111,
    name: 'Sepolia',
    symbol: 'ETH',
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    explorerUrl: 'https://sepolia.etherscan.io',
  },
};

export function getNetwork(chainId: number): NetworkConfig | undefined {
  return NETWORKS[chainId];
}

export function getRpcUrl(chainId: number): string {
  return NETWORKS[chainId]?.rpcUrl || 'https://eth.llamarpc.com';
}

export function getNativeSymbol(chainId: number): string {
  return NETWORKS[chainId]?.symbol || 'ETH';
}

export function getExplorerUrl(chainId: number): string {
  return NETWORKS[chainId]?.explorerUrl || 'https://etherscan.io';
}

export const SUPPORTED_CHAINS = Object.keys(NETWORKS).map(Number);
