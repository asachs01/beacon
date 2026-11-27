import { describe, expect, it, vi } from 'vitest';
import {
  IMAGE_READ_ERROR,
  MAGIC_IMPORT_STRUCTURE,
  extractImageMagicImport,
  importFromGenerateData,
} from './image-task';
import { DEFAULT_LOCAL_MEDIA_FOLDER, localMediaFolderFromBrowse } from './ha-media';

const ctx = {
  now: new Date('2026-11-20T18:00:00-07:00'),
  timeZone: 'America/Phoenix',
  locale: 'en-US',
};

const entity = {
  id: 'ai_task.openai_ai_task',
  name: 'OpenAI',
  locality: 'cloud' as const,
};

const image = {
  blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
  mime: 'image/jpeg',
  filename: 'beacon-import-abc.jpg',
};

const drafts = {
  events: [{
    title: 'Picture day',
    date: '2026-12-01',
    allDay: true,
    start: '',
    end: '',
    location: '',
    notes: '',
  }],
  items: [{ title: 'permission slip', list: 'todo' }],
};

describe('AI Task image extraction', () => {
  it('uploads a media-source attachment, reads structured data, and deletes the file', async () => {
    const uploadMedia = vi.fn(async () => 'media-source://media_source/local/./beacon-import-abc.jpg');
    const removeMedia = vi.fn(async () => {});
    const generateData = vi.fn(async () => ({
      service_response: { data: drafts, conversation_id: 'c1' },
    }));
    const result = await extractImageMagicImport(image, ctx, {
      entity,
      browseFolder: async () => DEFAULT_LOCAL_MEDIA_FOLDER,
      uploadMedia,
      removeMedia,
      generateData,
    });
    expect(uploadMedia).toHaveBeenCalledWith(
      image.blob,
      image.filename,
      'image/jpeg',
      DEFAULT_LOCAL_MEDIA_FOLDER,
    );
    const body = generateData.mock.calls[0][0] as {
      entity_id: string;
      attachments: Array<{ media_content_id: string; media_content_type: string }>;
      structure: typeof MAGIC_IMPORT_STRUCTURE;
    };
    expect(body.entity_id).toBe('ai_task.openai_ai_task');
    expect(body.attachments).toEqual([{
      media_content_id: 'media-source://media_source/local/./beacon-import-abc.jpg',
      media_content_type: 'image/jpeg',
    }]);
    expect(body.structure.events.selector.object.multiple).toBe(true);
    expect(result.events[0]).toMatchObject({ title: 'Picture day', allDay: true, startTime: null });
    expect(result.items[0]).toEqual({ title: 'permission slip', list: 'todo' });
    expect(result.source).toBe('home-assistant');
    expect(result.mediaLeftBehind).toBe(false);
    expect(removeMedia).toHaveBeenCalledOnce();
  });

  it('does not pretend the local parser read the image when the task reply is unusable', async () => {
    const removeMedia = vi.fn(async () => {});
    await expect(extractImageMagicImport(image, ctx, {
      entity,
      browseFolder: async () => DEFAULT_LOCAL_MEDIA_FOLDER,
      uploadMedia: async () => 'media-source://media_source/local/./beacon-import-abc.jpg',
      removeMedia,
      generateData: async () => ({ service_response: { data: 'I see a flyer' } }),
    })).rejects.toThrow(IMAGE_READ_ERROR);
    expect(removeMedia).toHaveBeenCalledOnce();
  });

  it('still removes the upload when generate_data throws, and says so if removal fails', async () => {
    await expect(extractImageMagicImport(image, ctx, {
      entity,
      browseFolder: async () => DEFAULT_LOCAL_MEDIA_FOLDER,
      uploadMedia: async () => 'media-source://media_source/local/./x.jpg',
      removeMedia: async () => { throw new Error('admin only'); },
      generateData: async () => { throw new Error('attachments not supported'); },
    })).rejects.toThrow(/media folder/);
  });

  it('reads the draft object from a generate_data response', () => {
    expect(importFromGenerateData({
      changed_states: [],
      service_response: { data: drafts },
    })?.events[0].title).toBe('Picture day');
  });
});

describe('local media folder', () => {
  it('uses the browsed local folder and otherwise the default media dir', () => {
    expect(localMediaFolderFromBrowse({
      media_content_id: 'media-source://media_source/local/.',
      can_expand: true,
    })).toBe('media-source://media_source/local/.');
    expect(localMediaFolderFromBrowse({ children: [] })).toBe(DEFAULT_LOCAL_MEDIA_FOLDER);
    expect(DEFAULT_LOCAL_MEDIA_FOLDER).toBe('media-source://media_source/local/.');
  });
});
