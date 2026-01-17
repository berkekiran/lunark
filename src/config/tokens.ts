export interface TokenConfig {
  symbol: string;
  name: string;
  decimals: number;
  addresses: Record<number, string>; // chainId -> address
}

// Common tokens with their addresses on different networks
export const TOKENS: Record<string, TokenConfig> = {
  // Stablecoins
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    addresses: {
      1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // Ethereum
      137: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // Polygon (native)
      42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Arbitrum (native)
      10: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', // Optimism (native)
      8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base
      43114: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', // Avalanche
      56: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', // BSC
      11155111: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // Sepolia (Circle official)
    },
  },
  USDT: {
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    addresses: {
      1: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // Ethereum
      137: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', // Polygon
      42161: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', // Arbitrum
      10: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', // Optimism
      8453: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', // Base
      43114: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', // Avalanche
      56: '0x55d398326f99059fF775485246999027B3197955', // BSC
      11155111: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0', // Sepolia (Aave testnet)
    },
  },
  DAI: {
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    decimals: 18,
    addresses: {
      1: '0x6B175474E89094C44Da98b954EescdeCB5BE3830', // Ethereum
      137: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', // Polygon
      42161: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', // Arbitrum
      10: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', // Optimism
      8453: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', // Base
      43114: '0xd586E7F844cEa2F87f50152665BCbc2C279D8d70', // Avalanche
      11155111: '0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357', // Sepolia (Aave testnet)
    },
  },
  // Wrapped native tokens
  WETH: {
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
    addresses: {
      1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // Ethereum
      137: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', // Polygon
      42161: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // Arbitrum
      10: '0x4200000000000000000000000000000000000006', // Optimism
      8453: '0x4200000000000000000000000000000000000006', // Base
      43114: '0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB', // Avalanche (WETH.e)
      11155111: '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9', // Sepolia
    },
  },
  WBTC: {
    symbol: 'WBTC',
    name: 'Wrapped Bitcoin',
    decimals: 8,
    addresses: {
      1: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', // Ethereum
      137: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6', // Polygon
      42161: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', // Arbitrum
      10: '0x68f180fcCe6836688e9084f035309E29Bf0A2095', // Optimism
      43114: '0x50b7545627a5162F82A992c33b87aDc75187B218', // Avalanche
    },
  },
  WMATIC: {
    symbol: 'WMATIC',
    name: 'Wrapped Matic',
    decimals: 18,
    addresses: {
      137: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // Polygon
    },
  },
  WBNB: {
    symbol: 'WBNB',
    name: 'Wrapped BNB',
    decimals: 18,
    addresses: {
      56: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // BSC
    },
  },
  WAVAX: {
    symbol: 'WAVAX',
    name: 'Wrapped AVAX',
    decimals: 18,
    addresses: {
      43114: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7', // Avalanche
    },
  },
  // DeFi tokens
  LINK: {
    symbol: 'LINK',
    name: 'Chainlink',
    decimals: 18,
    addresses: {
      1: '0x514910771AF9Ca656af840dff83E8264EcF986CA', // Ethereum
      137: '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39', // Polygon
      42161: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4', // Arbitrum
      10: '0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6', // Optimism
      43114: '0x5947BB275c521040051D82396192181b413227A3', // Avalanche
      11155111: '0x779877A7B0D9E8603169DdbD7836e478b4624789', // Sepolia
    },
  },
  UNI: {
    symbol: 'UNI',
    name: 'Uniswap',
    decimals: 18,
    addresses: {
      1: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', // Ethereum
      137: '0xb33EaAd8d922B1083446DC23f610c2567fB5180f', // Polygon
      42161: '0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0', // Arbitrum
      10: '0x6fd9d7AD17242c41f7131d257212c54A0e816691', // Optimism
    },
  },
  AAVE: {
    symbol: 'AAVE',
    name: 'Aave',
    decimals: 18,
    addresses: {
      1: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', // Ethereum
      137: '0xD6DF932A45C0f255f85145f286eA0b292B21C90B', // Polygon
      42161: '0xba5DdD1f9d7F570dc94a51479a000E3BCE967196', // Arbitrum
      10: '0x76FB31fb4af56892A25e32cFC43De717950c9278', // Optimism
      43114: '0x63a72806098Bd3D9520cC43356dD78afe5D386D9', // Avalanche
    },
  },
  // Meme tokens
  PEPE: {
    symbol: 'PEPE',
    name: 'Pepe',
    decimals: 18,
    addresses: {
      1: '0x6982508145454Ce325dDbE47a25d4ec3d2311933', // Ethereum
    },
  },
  SHIB: {
    symbol: 'SHIB',
    name: 'Shiba Inu',
    decimals: 18,
    addresses: {
      1: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', // Ethereum
    },
  },
};

// Get token by symbol for a specific chain
export function getToken(symbol: string, chainId: number): { address: string; decimals: number; name: string } | null {
  const upperSymbol = symbol.toUpperCase();
  const token = TOKENS[upperSymbol];

  if (!token) {
    return null;
  }

  const address = token.addresses[chainId];
  if (!address) {
    return null;
  }

  return {
    address,
    decimals: token.decimals,
    name: token.name,
  };
}

// Get all supported tokens for a chain
export function getTokensForChain(chainId: number): Array<{ symbol: string; address: string; decimals: number; name: string }> {
  const tokens: Array<{ symbol: string; address: string; decimals: number; name: string }> = [];

  for (const [symbol, config] of Object.entries(TOKENS)) {
    const address = config.addresses[chainId];
    if (address) {
      tokens.push({
        symbol,
        address,
        decimals: config.decimals,
        name: config.name,
      });
    }
  }

  return tokens;
}

// Check if a symbol is a native token for the chain
export function isNativeToken(symbol: string, chainId: number): boolean {
  const upperSymbol = symbol.toUpperCase();

  const nativeTokens: Record<number, string[]> = {
    1: ['ETH', 'ETHER'],
    137: ['MATIC', 'POL'],
    42161: ['ETH', 'ETHER'],
    10: ['ETH', 'ETHER'],
    8453: ['ETH', 'ETHER'],
    43114: ['AVAX'],
    56: ['BNB'],
    11155111: ['ETH', 'ETHER'],
  };

  return nativeTokens[chainId]?.includes(upperSymbol) || false;
}

// Get all supported token symbols
export function getSupportedTokenSymbols(): string[] {
  return Object.keys(TOKENS);
}
