/**
 * Ask a Home Assistant AI Task entity to read one image.
 *
 * generate_data does not accept inline image bytes. The attachment has to
 * be a media-source id that resolves to a local file (Home Assistant 2025.8
 * or newer). Beacon uploads to the local media source, calls the task, then
 * deletes that file. The bytes are not written to Beacon's /data or to
 * localStorage. A failed read never falls back to the local parser.
 */
import type { NamedAgent } from './agent';
import { zonedDayKey } from './calendar';
import type { ParseContext, ParsedImport } from './parse';
import { jsonFromAgentText, validateMagicImport } from './schema';

export const IMAGE_READ_ERROR =
  "Home Assistant's AI Task entity could not read this photo. Nothing was saved.";

const textField = { selector: { text: {} } };

/** Structured output matching the Magic Import draft schema. */
export const MAGIC_IMPORT_STRUCTURE = {
  events: {
    description: 'Calendar events visible in the attachment. An empty list when there are none. Each object uses only title, date (YYYY-MM-DD), allDay (boolean), start (HH:mm or empty), end (HH:mm or empty), location, and notes.',
    required: true,
    selector: {
      object: {
        multiple: true,
        fields: {
          title: { ...textField, required: true },
          date: { ...textField, required: true },
          allDay: { selector: { boolean: {} }, required: true },
          start: textField,
          end: textField,
          location: textField,
          notes: textField,
        },
      },
    },
  },
  items: {
    description: 'Shopping and to-do items visible in the attachment. An empty list when there are none. list is grocery or todo.',
    required: true,
    selector: {
      object: {
        multiple: true,
        fields: {
          title: { ...textField, required: true },
          list: {
            required: true,
            selector: { select: { options: ['grocery', 'todo'] } },
          },
        },
      },
    },
  },
};

export function magicImportImageInstructions(ctx: ParseContext): string {
  const today = zonedDayKey(ctx.now, ctx.timeZone);
  return [
    'Extract calendar events and list items from the attached image.',
    'Reply only through the structured output. No markdown. No extra keys.',
    'Schema: {"events":[{"title":string,"date":"YYYY-MM-DD","allDay":boolean,"start":"HH:mm"|null,"end":"HH:mm"|null,"location":string|null,"notes":string|null}],"items":[{"title":string,"list":"grocery"|"todo"}]}',
    `Today is ${today} (${ctx.timeZone}). Resolve relative dates from that day.`,
    'allDay is true only when there is no start time. When allDay is true, start and end are empty.',
    'When allDay is false, start is HH:mm and end is HH:mm or empty.',
    'Use an empty string when start, end, location, or notes are unknown.',
    'list is "grocery" for shopping and "todo" for other tasks.',
    'Do not invent items that are not visible in the image.',
  ].join('\n');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function hasDraftShape(value: unknown): value is Record<string, unknown> {
  const record = asRecord(value);
  return !!record && 'events' in record && 'items' in record;
}

/** Pull {events, items} out of a generate_data service response. */
export function importFromGenerateData(payload: unknown): ParsedImport | null {
  const found = walk(payload, 0);
  return found ? validateMagicImport(found) : null;
}

function walk(value: unknown, depth: number): unknown {
  if (depth > 6) return null;
  if (typeof value === 'string') return walk(jsonFromAgentText(value), depth + 1);
  if (hasDraftShape(value)) return value;
  const record = asRecord(value);
  if (!record) return null;
  for (const key of ['service_response', 'data', 'response', 'result']) {
    if (!(key in record)) continue;
    const nested = walk(record[key], depth + 1);
    if (hasDraftShape(nested)) return nested;
  }
  return null;
}

export interface ImageTaskDeps {
  entity: NamedAgent;
  browseFolder: () => Promise<string>;
  uploadMedia: (file: Blob, filename: string, contentType: string, folderId: string) => Promise<string>;
  removeMedia: (mediaContentId: string) => Promise<void>;
  generateData: (data: Record<string, unknown>) => Promise<unknown>;
}

export interface ImageExtraction extends ParsedImport {
  source: 'home-assistant';
  agent: NamedAgent;
  mediaLeftBehind: boolean;
}

export async function extractImageMagicImport(
  image: { blob: Blob; mime: string; filename: string },
  ctx: ParseContext,
  deps: ImageTaskDeps,
): Promise<ImageExtraction> {
  const folderId = await deps.browseFolder();
  const mediaContentId = await deps.uploadMedia(image.blob, image.filename, image.mime, folderId);
  let parsed: ParsedImport | null = null;
  let failed = false;
  try {
    const payload = await deps.generateData({
      task_name: 'Beacon magic import',
      instructions: magicImportImageInstructions(ctx),
      entity_id: deps.entity.id,
      structure: MAGIC_IMPORT_STRUCTURE,
      attachments: [{
        media_content_id: mediaContentId,
        media_content_type: image.mime,
      }],
    });
    parsed = importFromGenerateData(payload);
    if (!parsed) failed = true;
  } catch {
    failed = true;
  }
  let mediaLeftBehind = false;
  try {
    await deps.removeMedia(mediaContentId);
  } catch {
    mediaLeftBehind = true;
  }
  if (failed || !parsed) {
    const leftover = mediaLeftBehind ? ' Home Assistant still has the file in its media folder.' : '';
    throw new Error(IMAGE_READ_ERROR + leftover);
  }
  return {
    source: 'home-assistant',
    agent: deps.entity,
    events: parsed.events,
    items: parsed.items,
    mediaLeftBehind,
  };
}
