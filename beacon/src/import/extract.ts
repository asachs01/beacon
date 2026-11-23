/**
 * Magic Import extraction.
 *
 * When Home Assistant has a conversation agent, ask it for strict JSON.
 * Anything else — no agent, an error, or a reply that fails the schema —
 * stays on the device and uses the local parser. Beacon never calls a
 * third-party model itself.
 */
import { zonedDayKey } from './calendar';
import { parseMagicImportText, type ParseContext, type ParsedImport } from './parse';
import { jsonFromAgentText, validateMagicImport } from './schema';
import { extractConversationSpeech } from '../voice/assist';

export interface ExtractDeps {
  listAgents: () => Promise<Array<{ id: string }>>;
  processConversation: (text: string) => Promise<unknown>;
}

export interface Extraction extends ParsedImport {
  source: 'home-assistant' | 'local';
}

export function magicImportPrompt(text: string, ctx: ParseContext): string {
  const today = zonedDayKey(ctx.now, ctx.timeZone);
  return [
    'Extract calendar events and list items from the family message below.',
    'Reply with JSON only. No markdown. No extra keys.',
    'Schema: {"events":[{"title":string,"date":"YYYY-MM-DD","allDay":boolean,"start":"HH:mm"|null,"end":"HH:mm"|null,"location":string|null,"notes":string|null}],"items":[{"title":string,"list":"grocery"|"todo"}]}',
    `Today is ${today} (${ctx.timeZone}). Resolve relative dates from that day.`,
    'allDay is true only when there is no start time. When allDay is true, start and end are null.',
    'When allDay is false, start is HH:mm and end is HH:mm or null.',
    'list is "grocery" for shopping and "todo" for other tasks.',
    'Do not invent items that are not in the message.',
    'Message:',
    text.trim().slice(0, 8000),
  ].join('\n');
}

function responseType(value: unknown, depth = 0): string {
  if (!value || typeof value !== 'object' || depth > 6) return '';
  const record = value as Record<string, unknown>;
  if (typeof record.response_type === 'string') return record.response_type;
  for (const key of ['service_response', 'response', 'result']) {
    if (key in record) {
      const nested = responseType(record[key], depth + 1);
      if (nested) return nested;
    }
  }
  return '';
}

function fromAgent(payload: unknown): ParsedImport | null {
  if (responseType(payload) === 'error') return null;
  const direct = validateMagicImport(payload);
  if (direct) return direct;
  const speech = extractConversationSpeech(payload);
  if (!speech) return null;
  return validateMagicImport(jsonFromAgentText(speech));
}

export async function extractMagicImport(
  text: string,
  ctx: ParseContext,
  deps: ExtractDeps,
): Promise<Extraction> {
  const local = (): Extraction => ({ source: 'local', ...parseMagicImportText(text, ctx) });
  if (!text.trim()) return { source: 'local', events: [], items: [] };

  let agents: Array<{ id: string }> = [];
  try {
    agents = await deps.listAgents();
  } catch {
    agents = [];
  }
  if (agents.length === 0) return local();

  try {
    const payload = await deps.processConversation(magicImportPrompt(text, ctx));
    const parsed = fromAgent(payload);
    if (!parsed) return local();
    return { source: 'home-assistant', ...parsed };
  } catch {
    return local();
  }
}
