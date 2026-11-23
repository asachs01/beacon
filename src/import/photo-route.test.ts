import { describe, expect, it } from 'vitest';
import { nameAiTaskEntity, photoImportUnavailable } from './photo-route';

describe('AI Task entity label', () => {
  it('reuses the conversation classifier for local, cloud, and may be cloud', () => {
    expect(nameAiTaskEntity('ai_task.ollama_ai_task', 'Ollama')).toEqual({
      id: 'ai_task.ollama_ai_task',
      name: 'Ollama',
      locality: 'local',
    });
    expect(nameAiTaskEntity('ai_task.openai_ai_task', 'OpenAI').locality).toBe('cloud');
    expect(nameAiTaskEntity('ai_task.google_generative_ai_ai_task', 'Google AI').locality).toBe('cloud');
    expect(nameAiTaskEntity('ai_task.my_helper', 'My Helper').locality).toBe('maybe-cloud');
    expect(nameAiTaskEntity('ai_task.custom_task').name).toBe('ai_task.custom_task');
  });
});

describe('photo import availability', () => {
  it('is unavailable when the local parser is forced or no entity is set', () => {
    expect(photoImportUnavailable(false, 'ai_task.ollama_ai_task')).toBe('local-only');
    expect(photoImportUnavailable(true, '')).toBe('no-entity');
    expect(photoImportUnavailable(true, 'conversation.openai_conversation')).toBe('no-entity');
    expect(photoImportUnavailable(true, 'ai_task.openai_ai_task')).toBeNull();
  });
});
