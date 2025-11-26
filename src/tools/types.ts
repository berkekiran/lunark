export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  enum?: string[];
  default?: unknown;
}

export interface ToolContext {
  userAddress: string;
  chainId?: number;
  agent?: any; // LunarkAgent instance for network switching
  chatId?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  handler: (params: Record<string, unknown>, context?: ToolContext) => Promise<unknown>;
}

export interface PluginDefinition {
  name: string;
  version: string;
  description: string;
  tools: ToolDefinition[];
  initialize?: (config?: Record<string, unknown>) => Promise<void>;
  cleanup?: () => Promise<void>;
}
