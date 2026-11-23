/**
 * Home Assistant conversation access for Magic Import.
 * Same websocket-then-REST path press-to-talk already uses.
 */
import { callHaService, haFetch } from '../api/ha-rest';
import type { HomeAssistantClient } from '../api/homeassistant';
import type { ExtractDeps } from './extract';

export function conversationDeps(
  getClient: () => HomeAssistantClient | null,
): ExtractDeps {
  return {
    listAgents: async () => {
      const client = getClient();
      if (client?.isConnected) {
        try {
          return await client.listConversationAgents();
        } catch {
          /* REST fallback below */
        }
      }
      try {
        const config = await haFetch('/api/config') as { components?: string[] };
        if (Array.isArray(config?.components) && config.components.includes('conversation')) {
          return [{ id: 'conversation.home_assistant' }];
        }
      } catch {
        /* no agent */
      }
      return [];
    },
    processConversation: async (text) => {
      const client = getClient();
      if (client?.isConnected) {
        try {
          return await client.processConversation(text);
        } catch {
          /* REST fallback below */
        }
      }
      return callHaService('conversation', 'process', { text }, true);
    },
  };
}
