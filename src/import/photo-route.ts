/**
 * Photos and scanned PDFs use one Home Assistant AI Task entity.
 * The same locality classifier as conversation agents labels it
 * local, cloud, or may be cloud.
 */
import { nameConversationAgent, type NamedAgent } from './agent';

export function nameAiTaskEntity(entityId: string, friendlyName?: string): NamedAgent {
  const id = entityId.trim();
  return nameConversationAgent({ id, name: friendlyName?.trim() || id });
}

export type PhotoUnavailable = 'local-only' | 'no-entity';

/**
 * Photo and scan import is off when the parent forced the local parser,
 * or when no ai_task entity is chosen. Text PDFs do not use this check.
 */
export function photoImportUnavailable(
  useHomeAssistant: boolean,
  entityId: string,
): PhotoUnavailable | null {
  if (!useHomeAssistant) return 'local-only';
  if (!entityId.trim().startsWith('ai_task.')) return 'no-entity';
  return null;
}
