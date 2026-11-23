import { describe, expect, it } from 'vitest';
import {
  classifyConversationAgent,
  nameConversationAgent,
  selectConversationAgent,
} from './agent';

describe('conversation agent locality', () => {
  it('labels the built-in agent and known local integrations as local', () => {
    expect(classifyConversationAgent({
      id: 'conversation.home_assistant',
      name: 'Home Assistant',
    })).toBe('local');
    expect(classifyConversationAgent({
      id: 'conversation.ollama_conversation',
      name: 'Ollama',
    })).toBe('local');
    expect(classifyConversationAgent({
      id: 'conversation.local_llm',
      name: 'Local LLM',
    })).toBe('local');
  });

  it('labels hosted integrations as cloud', () => {
    expect(classifyConversationAgent({
      id: 'conversation.openai_conversation',
      name: 'OpenAI Conversation',
    })).toBe('cloud');
    expect(classifyConversationAgent({
      id: 'conversation.google_generative_ai_conversation',
      name: 'Google AI',
    })).toBe('cloud');
    expect(classifyConversationAgent({
      id: 'conversation.anthropic',
      name: 'Anthropic',
    })).toBe('cloud');
    expect(classifyConversationAgent({
      id: 'conversation.cloud',
      name: 'Home Assistant Cloud',
    })).toBe('cloud');
  });

  it('labels an unrecognized agent as may be cloud', () => {
    expect(classifyConversationAgent({
      id: 'conversation.my_helper',
      name: 'My Helper',
    })).toBe('maybe-cloud');
  });

  it('prefers a local integration id over a cloud-like model name', () => {
    expect(classifyConversationAgent({
      id: 'conversation.ollama_conversation',
      name: 'Mistral',
    })).toBe('local');
  });
});

describe('select conversation agent', () => {
  const agents = [
    { id: 'conversation.home_assistant', name: 'Home Assistant' },
    { id: 'conversation.openai_conversation', name: 'OpenAI Conversation' },
  ];

  it('uses the default agent Home Assistant will run', () => {
    const selected = selectConversationAgent(agents, 'conversation.openai_conversation');
    expect(nameConversationAgent(selected!).name).toBe('OpenAI Conversation');
    expect(nameConversationAgent(selected!).locality).toBe('cloud');
  });

  it('falls back to the built-in agent when no default is published', () => {
    expect(selectConversationAgent(agents, null)?.id).toBe('conversation.home_assistant');
  });

  it('names a default id even when it is missing from the list', () => {
    const selected = selectConversationAgent(agents, 'conversation.custom_agent');
    expect(selected).toEqual({ id: 'conversation.custom_agent' });
    expect(nameConversationAgent(selected!).locality).toBe('maybe-cloud');
  });
});
