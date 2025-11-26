// Removed Chat and Message models - using tasks instead
export interface Task {
  id: number;
  agentId: number;
  prompt: string;
  response: string | null;
  status: string | null;
  metadata: any;
  created_at: Date;
  updated_at: Date;
  completedAt: Date | null;
}

export interface UserSettings {
  userId: string;
  preferences?: Record<string, any>;
}

export interface StreamResponse {
  content: string;
  done: boolean;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
  result?: any;
}

export interface BlockchainToolArgs {
  chainId?: number;
  [key: string]: any;
}

export type LLMRole = 'user' | 'assistant' | 'system';

export interface LLMMessage {
  role: LLMRole;
  content: string;
}
