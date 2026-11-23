import { describe, expect, it, vi } from 'vitest';
import {
  conversationSucceeded,
  extractConversationSpeech,
  navigationTargetFromUtterance,
  normalizeNavigateView,
  runVoiceCommand,
  speechRecognitionAvailable,
} from './assist';

describe('voice assist routing', () => {
  it('uses conversation.process when an add-on has an agent', async () => {
    const processConversation = vi.fn(async () => ({
      response: {
        response_type: 'action_done',
        speech: { plain: { speech: 'Marked Dishes as done for Ada.' } },
      },
    }));
    const postBeaconVoice = vi.fn();
    const result = await runVoiceCommand('mark dishes as done', {
      addOn: true,
      listAgents: async () => [{ id: 'conversation.home_assistant' }],
      processConversation,
      postBeaconVoice,
    });
    expect(result.route).toBe('home-assistant');
    expect(result.response).toBe('Marked Dishes as done for Ada.');
    expect(result.refreshChores).toBe(true);
    expect(postBeaconVoice).not.toHaveBeenCalled();
  });

  it('falls back to the Beacon voice API when Assist has no answer', async () => {
    const postBeaconVoice = vi.fn(async () => ({
      response: 'Marked Vacuum as done for Ada.',
      action: 'complete_chore',
      success: true,
    }));
    const result = await runVoiceCommand('mark vacuum as done', {
      addOn: true,
      listAgents: async () => [{ id: 'conversation.home_assistant' }],
      processConversation: async () => ({
        response: {
          response_type: 'error',
          speech: { plain: { speech: "Sorry, I couldn't understand that." } },
        },
      }),
      postBeaconVoice,
    });
    expect(result.route).toBe('beacon');
    expect(result.success).toBe(true);
    expect(result.refreshChores).toBe(true);
    expect(postBeaconVoice).toHaveBeenCalledWith('mark vacuum as done');
  });

  it('skips Assist outside add-on mode', async () => {
    const listAgents = vi.fn(async () => [{ id: 'conversation.home_assistant' }]);
    const postBeaconVoice = vi.fn(async () => ({
      response: 'Added milk to grocery',
      action: 'add_item',
      success: true,
    }));
    const result = await runVoiceCommand('add milk to the grocery list', {
      addOn: false,
      listAgents,
      processConversation: vi.fn(),
      postBeaconVoice,
    });
    expect(listAgents).not.toHaveBeenCalled();
    expect(result.route).toBe('beacon');
    expect(result.response).toBe('Added milk to grocery');
  });

  it('navigates from a Beacon voice response and from beacon_navigate names', () => {
    expect(normalizeNavigateView('Chores')).toBe('chores');
    expect(normalizeNavigateView('the grocery view')).toBe('grocery');
    expect(normalizeNavigateView('shopping')).toBe('grocery');
    expect(navigationTargetFromUtterance('show the calendar')).toBe('calendar');
    expect(navigationTargetFromUtterance("what's on the calendar today")).toBeNull();
  });

  it('reads speech out of a service response and treats errors as failure', () => {
    const payload = {
      service_response: {
        response: { speech: { plain: { speech: 'You have 1 event today: Practice.' } }, response_type: 'query_answer' },
      },
    };
    expect(extractConversationSpeech(payload)).toBe('You have 1 event today: Practice.');
    expect(conversationSucceeded(payload)).toBe(true);
    expect(conversationSucceeded({
      response: { response_type: 'error', speech: { plain: { speech: 'Sorry, no intent.' } } },
    })).toBe(false);
  });

  it('hides the mic without a secure context or the Web Speech API', () => {
    expect(speechRecognitionAvailable({ isSecureContext: false, SpeechRecognition: function Speech() {} })).toBe(false);
    expect(speechRecognitionAvailable({ isSecureContext: true })).toBe(false);
    expect(speechRecognitionAvailable({
      isSecureContext: true,
      webkitSpeechRecognition: function Speech() {},
    })).toBe(true);
  });
});
