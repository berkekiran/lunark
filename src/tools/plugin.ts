import { PluginDefinition } from './types';
import { transferTool } from './transfer';
import { balanceTool } from './balance';
import { walletBalanceTool } from './wallet-balance';
import { approveTool } from './approve';
import { swapTool } from './swap';
import {
  addContactTool,
  listContactsTool,
  resolveContactTool,
  deleteContactTool,
} from './contacts';
import {
  resolveTokenTool,
  isNativeTokenTool,
  switchNetworkTool,
  listToolsTool,
} from './token-utils';

export const lunarkPlugin: PluginDefinition = {
  name: 'lunark-blockchain',
  version: '2.0.0',
  description: 'Blockchain interaction tools for Web3 operations',
  tools: [
    walletBalanceTool, // Lunark platform wallet balance (internal USD balance)
    transferTool,
    balanceTool, // Blockchain token balance
    approveTool,
    swapTool, // DEX token swaps
    resolveTokenTool,
    isNativeTokenTool,
    switchNetworkTool,
    addContactTool,
    listContactsTool,
    resolveContactTool,
    deleteContactTool,
    listToolsTool,
  ],
  initialize: async () => {},
  cleanup: async () => {},
};
