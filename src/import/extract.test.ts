import { describe, expect, it, vi } from 'vitest';
import { extractMagicImport, planMagicImport } from './extract';

const ctx = {
  now: new Date('2026-11-20T18:00:00-07:00'),
  timeZone: 'America/Phoenix',
  locale: 'en-US',
};

const openai = {
  agents: [
    { id: 'conversation.home_assistant', name: 'Home Assistant' },
    { id: 'conversation.openai_conversation', name: 'OpenAI Conversation' },
  ],
  defaultAgentId: 'conversation.openai_conversation',
};

describe('magic import extraction', () => {
  it('names the conversation agent when its JSON is valid', async () => {
    const processConversation = vi.fn(async () => ({
      response: {
        response_type: 'action_done',
        speech: {
          plain: {
            speech: '{"events":[{"title":"Picture day","date":"2026-12-01","allDay":true,"start":null,"end":null,"location":null,"notes":null}],"items":[]}',
          },
        },
      },
    }));
    const result = await extractMagicImport('Picture day sometime', ctx, {
      listAgents: async () => openai,
      processConversation,
    });
    expect(result.source).toBe('home-assistant');
    expect(result.agent).toEqual({
      id: 'conversation.openai_conversation',
      name: 'OpenAI Conversation',
      locality: 'cloud',
    });
    expect(result.events[0]).toMatchObject({ title: 'Picture day', date: '2026-12-01', allDay: true });
    expect(processConversation).toHaveBeenCalledOnce();
    expect(processConversation.mock.calls[0][1]).toBe('conversation.openai_conversation');
    const prompt = String(processConversation.mock.calls[0][0]);
    expect(prompt).toContain('Today is 2026-11-20');
    expect(prompt).toContain('Picture day sometime');
  });

  it('labels the built-in agent as local', async () => {
    const planned = await planMagicImport({
      listAgents: async () => ({
        agents: [{ id: 'conversation.home_assistant', name: 'Home Assistant' }],
        defaultAgentId: 'conversation.home_assistant',
      }),
      processConversation: vi.fn(),
    });
    expect(planned.agent).toEqual({
      id: 'conversation.home_assistant',
      name: 'Home Assistant',
      locality: 'local',
    });
  });

  it('labels an unknown agent as may be cloud', async () => {
    const planned = await planMagicImport({
      listAgents: async () => ({ agents: [], defaultAgentId: null, unnamed: true }),
      processConversation: vi.fn(),
    });
    expect(planned.source).toBe('home-assistant');
    expect(planned.agent).toEqual({ id: '', name: '', locality: 'maybe-cloud' });
  });

  it('falls back to the local parser when the agent reply is invalid', async () => {
    const result = await extractMagicImport('Practice tomorrow at 3pm', ctx, {
      listAgents: async () => ({
        agents: [{ id: 'conversation.home_assistant', name: 'Home Assistant' }],
        defaultAgentId: null,
      }),
      processConversation: async () => ({
        response: {
          response_type: 'action_done',
          speech: { plain: { speech: 'I added it to your calendar.' } },
        },
      }),
    });
    expect(result.source).toBe('local');
    expect(result.agent).toBeNull();
    expect(result.events[0]).toMatchObject({ title: 'Practice', date: '2026-11-21', startTime: '15:00' });
  });

  it('falls back when the agent errors or there is no agent', async () => {
    const processConversation = vi.fn();
    const noAgent = await extractMagicImport('Practice tomorrow at 3pm', ctx, {
      listAgents: async () => ({ agents: [], defaultAgentId: null }),
      processConversation,
    });
    expect(noAgent.source).toBe('local');
    expect(noAgent.agent).toBeNull();
    expect(noAgent.events[0].date).toBe('2026-11-21');
    expect(processConversation).not.toHaveBeenCalled();

    const errored = await extractMagicImport('milk\neggs', ctx, {
      listAgents: async () => openai,
      processConversation: async () => ({
        response: { response_type: 'error', speech: { plain: { speech: 'Sorry, I could not do that.' } } },
      }),
    });
    expect(errored.source).toBe('local');
    expect(errored.agent).toBeNull();
    expect(errored.items.map((item) => item.title)).toEqual(['milk', 'eggs']);
  });

  it('forces the local parser when Home Assistant is turned off', async () => {
    const processConversation = vi.fn();
    const result = await extractMagicImport('Practice tomorrow at 3pm', ctx, {
      useHomeAssistant: false,
      listAgents: async () => openai,
      processConversation,
    });
    expect(result.source).toBe('local');
    expect(result.agent).toBeNull();
    expect(result.events[0]).toMatchObject({ title: 'Practice', date: '2026-11-21' });
    expect(processConversation).not.toHaveBeenCalled();

    const planned = await planMagicImport({
      useHomeAssistant: false,
      listAgents: async () => openai,
      processConversation,
    });
    expect(planned).toEqual({ source: 'local', agent: null });
  });
});
