import { describe, expect, it, vi } from 'vitest';
import { extractMagicImport } from './extract';

const ctx = {
  now: new Date('2026-11-20T18:00:00-07:00'),
  timeZone: 'America/Phoenix',
  locale: 'en-US',
};

describe('magic import extraction', () => {
  it('uses the conversation agent when one is available and the JSON is valid', async () => {
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
      listAgents: async () => [{ id: 'conversation.home_assistant' }],
      processConversation,
    });
    expect(result.source).toBe('home-assistant');
    expect(result.events[0]).toMatchObject({ title: 'Picture day', date: '2026-12-01', allDay: true });
    expect(processConversation).toHaveBeenCalledOnce();
    const prompt = String(processConversation.mock.calls[0][0]);
    expect(prompt).toContain('Today is 2026-11-20');
    expect(prompt).toContain('Picture day sometime');
  });

  it('falls back to the local parser when the agent reply is invalid', async () => {
    const result = await extractMagicImport('Practice tomorrow at 3pm', ctx, {
      listAgents: async () => [{ id: 'conversation.home_assistant' }],
      processConversation: async () => ({
        response: {
          response_type: 'action_done',
          speech: { plain: { speech: 'I added it to your calendar.' } },
        },
      }),
    });
    expect(result.source).toBe('local');
    expect(result.events[0]).toMatchObject({ title: 'Practice', date: '2026-11-21', startTime: '15:00' });
  });

  it('falls back when the agent errors or there is no agent', async () => {
    const processConversation = vi.fn();
    const noAgent = await extractMagicImport('Practice tomorrow at 3pm', ctx, {
      listAgents: async () => [],
      processConversation,
    });
    expect(noAgent.source).toBe('local');
    expect(noAgent.events[0].date).toBe('2026-11-21');
    expect(processConversation).not.toHaveBeenCalled();

    const errored = await extractMagicImport('milk\neggs', ctx, {
      listAgents: async () => [{ id: 'conversation.home_assistant' }],
      processConversation: async () => ({
        response: { response_type: 'error', speech: { plain: { speech: 'Sorry, I could not do that.' } } },
      }),
    });
    expect(errored.source).toBe('local');
    expect(errored.items.map((item) => item.title)).toEqual(['milk', 'eggs']);
  });
});
