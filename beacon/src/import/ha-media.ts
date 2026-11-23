/**
 * Home Assistant cannot attach inline bytes to ai_task.generate_data.
 * Upload the image to the local media source, pass that media id, then
 * delete the file. This module does not write Beacon's /data or localStorage.
 *
 * Upload: POST /api/media_source/local_source/upload
 *   multipart fields media_content_id (folder) and file.
 *   Requires an admin user. Home Assistant 2025.8 or newer for attachments.
 * Delete: websocket media_source/local_source/remove.
 * In the add-on, both go through /beacon-action/* so ingress does not
 * rewrite the /api POST body.
 */
import type { HomeAssistantClient } from '../api/homeassistant';
import { callBeaconAction, callHaService, haFormPost } from '../api/ha-rest';
import { isAddOn } from '../utils/ha-env';
import type { NamedAgent } from './agent';
import {
  extractImageMagicImport,
  type ImageExtraction,
  type ImageTaskDeps,
} from './image-task';
import type { ParseContext } from './parse';
import { nameAiTaskEntity } from './photo-route';

/** Default local media folder when Home Assistant has the standard media dir. */
export const DEFAULT_LOCAL_MEDIA_FOLDER = 'media-source://media_source/local/.';

const UPLOAD_ERROR =
  'Home Assistant could not take this photo for its AI Task entity. Nothing was saved. Photo import needs Home Assistant 2025.8 or newer, an admin token, and a local media folder.';

export function localMediaFolderFromBrowse(payload: unknown): string {
  const found = findFolder(payload, 0);
  return found ?? DEFAULT_LOCAL_MEDIA_FOLDER;
}

function findFolder(value: unknown, depth: number): string | null {
  if (!value || typeof value !== 'object' || depth > 4) return null;
  const record = value as Record<string, unknown>;
  const id = record.media_content_id;
  if (
    record.can_expand === true
    && typeof id === 'string'
    && id.startsWith('media-source://media_source/')
  ) {
    return id;
  }
  const children = record.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const nested = findFolder(child, depth + 1);
      if (nested) return nested;
    }
  }
  if ('result' in record) return findFolder(record.result, depth + 1);
  return null;
}

async function browseFolder(getClient: () => HomeAssistantClient | null): Promise<string> {
  const client = getClient();
  if (client?.isConnected) {
    try {
      return localMediaFolderFromBrowse(await client.browseMedia('media-source://media_source'));
    } catch {
      /* REST / add-on fallback below */
    }
  }
  if (isAddOn()) {
    try {
      return localMediaFolderFromBrowse(await callBeaconAction('/beacon-action/media-browse', {}));
    } catch {
      /* default folder */
    }
  }
  return DEFAULT_LOCAL_MEDIA_FOLDER;
}

async function uploadMedia(file: Blob, filename: string, contentType: string, folderId: string): Promise<string> {
  const body = new FormData();
  body.append('media_content_id', folderId);
  const named = new File([file], filename, { type: contentType });
  body.append('file', named, filename);
  const path = isAddOn()
    ? '/beacon-action/media-upload'
    : '/api/media_source/local_source/upload';
  let payload: unknown;
  try {
    payload = await haFormPost(path, body);
  } catch {
    throw new Error(UPLOAD_ERROR);
  }
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : null;
  const id = record?.media_content_id;
  if (typeof id !== 'string' || !id.startsWith('media-source://')) {
    throw new Error(UPLOAD_ERROR);
  }
  return id;
}

async function removeMedia(getClient: () => HomeAssistantClient | null, mediaContentId: string): Promise<void> {
  const client = getClient();
  if (client?.isConnected) {
    await client.removeLocalMedia(mediaContentId);
    return;
  }
  if (isAddOn()) {
    await callBeaconAction('/beacon-action/media-remove', { media_content_id: mediaContentId });
    return;
  }
  throw new Error('Home Assistant is not connected, so the uploaded photo could not be removed.');
}

export function imageTaskDeps(
  getClient: () => HomeAssistantClient | null,
  entityId: string,
  friendlyName?: string,
): ImageTaskDeps {
  const entity: NamedAgent = nameAiTaskEntity(entityId, friendlyName);
  return {
    entity,
    browseFolder: () => browseFolder(getClient),
    uploadMedia,
    removeMedia: (mediaContentId) => removeMedia(getClient, mediaContentId),
    generateData: (data) => callHaService('ai_task', 'generate_data', data, true),
  };
}

export function readImageWithHomeAssistant(
  getClient: () => HomeAssistantClient | null,
  entityId: string,
  friendlyName: string | undefined,
  image: { blob: Blob; mime: string; filename: string },
  ctx: ParseContext,
): Promise<ImageExtraction> {
  return extractImageMagicImport(image, ctx, imageTaskDeps(getClient, entityId, friendlyName));
}
