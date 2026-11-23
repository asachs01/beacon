/**
 * Home Assistant conversation access for Magic Import.
 * Same websocket-then-REST path press-to-talk already uses.
 *
 * Beacon hands the text to Home Assistant. It does not send the text to
 * a provider itself. A cloud conversation agent is Home Assistant's call.
 */
import { callHaService, haFetch } from '../api/ha-rest';
import type { HomeAssistantClient } from '../api/homeassistant';
import type { AgentListing } from './agent';
import type { ExtractDeps } from './extract';

export function conversationDeps(
  getClient: () => HomeAssistantClient | null,
  useHomeAssistant = true,
): ExtractDeps {
  return {
    useHomeAssistant,
    listAgents: async (): Promise<AgentListing> => {
      const client = getClient();
      if (client?.isConnected) {
        try {
          return await client.describeConversationAgents();
        } catch {
          /* REST fallback below */
        }
      }
      try {
        const config = await haFetch('/api/config') as { components?: string[] };
        if (Array.isArray(config?.components) && config.components.includes('conversation')) {
          return { agents: [], defaultAgentId: null, unnamed: true };
        }
      } catch {
        /* no agent */
      }
      return { agents: [], defaultAgentId: null };
    },
    processConversation: async (text, agentId) => {
      const client = getClient();
      const data: { text: string; agent_id?: string } = { text };
      if (agentId) data.agent_id = agentId;
      if (client?.isConnected) {
        try {
          return await client.processConversation(text, undefined, agentId);
        } catch {
          /* REST fallback below */
        }
      }
      return callHaService('conversation', 'process', data, true);
    },
  };
}
