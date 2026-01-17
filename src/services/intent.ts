import { Agent } from '@astreus-ai/astreus';

interface IntentResult {
  intent: string;
  confidence: number;
  suggestedTools: string[];
  requiresChainId: boolean;
}

export class IntentRecognition {
  private agent: Agent | null = null;

  async initialize(): Promise<void> {
    if (this.agent) return;

    this.agent = await Agent.create({
      name: 'IntentAnalyzer',
      model: 'gpt-4o-mini',
      memory: false,
    });
  }

  async analyzeIntent(message: string): Promise<IntentResult> {
    if (!this.agent) await this.initialize();

    const prompt = `Analyze the user's intent from this message and determine which tools they need.

Available tools:
- transfer: Send tokens to an address
- get_balance: Check wallet balance
- approve_token: Approve token spending
- resolve_token: Find token address by symbol
- is_native_token: Check if token is native
- switch_network: Get network information
- add_contact: Save a contact
- list_contacts: View contacts
- resolve_contact: Find contact by name
- delete_contact: Remove contact

User message: "${message}"

Respond in JSON format:
{
  "intent": "brief description of what user wants",
  "confidence": 0.0-1.0,
  "suggestedTools": ["tool1", "tool2"],
  "requiresChainId": true/false
}`;

    const response = await this.agent!.ask(prompt);

    try {
      // Extract JSON from response
      const jsonMatch = String(response).match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return result;
      }
    } catch (error) {
      console.error('Intent parsing error:', error);
    }

    // Fallback
    return {
      intent: 'general conversation',
      confidence: 0.5,
      suggestedTools: [],
      requiresChainId: false,
    };
  }
}
