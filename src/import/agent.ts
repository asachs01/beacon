/**
 * Which Home Assistant conversation agent Magic Import will name.
 *
 * Beacon does not send the pasted text anywhere itself. Home Assistant
 * sends it on when the agent it runs is a cloud integration.
 */

export type AgentLocality = 'local' | 'cloud' | 'maybe-cloud';

export interface ConversationAgentRef {
  id: string;
  name?: string;
}

export interface AgentListing {
  agents: ConversationAgentRef[];
  defaultAgentId: string | null;
  /**
   * Home Assistant has a conversation component, but this client cannot
   * see the agent id. The UI must say the agent may be cloud.
   */
  unnamed?: boolean;
}

export interface NamedAgent {
  id: string;
  name: string;
  locality: AgentLocality;
}

const LOCAL_HINTS = [
  'ollama',
  'localai',
  'local_llm',
  'local-llm',
  'local llm',
  'llama.cpp',
  'llamacpp',
  'llama_cpp',
];

const CLOUD_HINTS = [
  'openai',
  'chatgpt',
  'google',
  'gemini',
  'generative_ai',
  'generative ai',
  'anthropic',
  'claude',
  'groq',
  'openrouter',
  'open_router',
  'mistral',
  'perplexity',
  'bedrock',
  'azure',
  'nabu',
  'home assistant cloud',
  'home_assistant_cloud',
];

function includesAny(haystack: string, hints: readonly string[]): boolean {
  return hints.some((hint) => haystack.includes(hint));
}

/**
 * Built-in Assist and known on-device integrations are local.
 * OpenAI, Google, Anthropic, and other hosted integrations are cloud.
 * Anything else may be cloud.
 */
export function classifyConversationAgent(agent: ConversationAgentRef): AgentLocality {
  const id = agent.id.toLowerCase();
  const name = (agent.name ?? '').toLowerCase();

  if (id === 'conversation.home_assistant' || name === 'home assistant') return 'local';
  if (includesAny(id, CLOUD_HINTS)) return 'cloud';
  if (includesAny(id, LOCAL_HINTS) || includesAny(name, LOCAL_HINTS)) return 'local';
  if (includesAny(name, CLOUD_HINTS)) return 'cloud';
  return 'maybe-cloud';
}

/** The agent conversation.process will run when no agent_id is passed. */
export function selectConversationAgent(
  agents: readonly ConversationAgentRef[],
  defaultAgentId: string | null,
): ConversationAgentRef | null {
  const named = agents.filter((agent) => agent.id);
  if (defaultAgentId) {
    return named.find((agent) => agent.id === defaultAgentId) ?? { id: defaultAgentId };
  }
  const builtin = named.find((agent) => agent.id === 'conversation.home_assistant');
  if (builtin) return builtin;
  if (named.length === 1) return named[0];
  return null;
}

export function nameConversationAgent(agent: ConversationAgentRef): NamedAgent {
  return {
    id: agent.id,
    name: agent.name?.trim() || agent.id,
    locality: classifyConversationAgent(agent),
  };
}
