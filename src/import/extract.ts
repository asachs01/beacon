/**
 * Magic Import extraction.
 *
 * When the household allows it and Home Assistant has a conversation agent,
 * ask that agent for strict JSON. Beacon does not call a model itself.
 * Home Assistant sends the text on only if that agent is a cloud service.
 * No agent, a refused setting, an error, or a reply that fails the schema
 * uses the local parser.
 */
import {
  nameConversationAgent,
  selectConversationAgent,
  type AgentListing,
  type NamedAgent,
} from './agent';
import { zonedDayKey } from './calendar';
import { parseMagicImportText, type ParseContext, type ParsedImport } from './parse';
import { jsonFromAgentText, validateMagicImport } from './schema';
import { extractConversationSpeech } from '../voice/assist';

export interface ExtractDeps {
  /** When false, never call Home Assistant. Defaults to asking it. */
  useHomeAssistant?: boolean;
  listAgents: () => Promise<AgentListing>;
  processConversation: (text: string, agentId?: string) => Promise<unknown>;
}

export interface Extraction extends ParsedImport {
  source: 'home-assistant' | 'local';
  agent: NamedAgent | null;
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

const LOCAL: Pick<Extraction, 'source' | 'agent'> = { source: 'local', agent: null };

/** The reader the paste screen should name before anyone submits text. */
export async function planMagicImport(deps: ExtractDeps): Promise<Pick<Extraction, 'source' | 'agent'>> {
  if (deps.useHomeAssistant === false) return LOCAL;

  let listing: AgentListing;
  try {
    listing = await deps.listAgents();
  } catch {
    return LOCAL;
  }

  if (listing.unnamed) {
    return { source: 'home-assistant', agent: { id: '', name: '', locality: 'maybe-cloud' } };
  }

  const selected = selectConversationAgent(listing.agents, listing.defaultAgentId);
  if (!selected) {
    if (listing.agents.length > 0) {
      return { source: 'home-assistant', agent: { id: '', name: '', locality: 'maybe-cloud' } };
    }
    return LOCAL;
  }
  return { source: 'home-assistant', agent: nameConversationAgent(selected) };
}

export async function extractMagicImport(
  text: string,
  ctx: ParseContext,
  deps: ExtractDeps,
): Promise<Extraction> {
  const local = (): Extraction => ({ ...LOCAL, ...parseMagicImportText(text, ctx) });
  if (!text.trim()) return { ...LOCAL, events: [], items: [] };

  const planned = await planMagicImport(deps);
  if (planned.source === 'local') return local();

  try {
    const payload = await deps.processConversation(
      magicImportPrompt(text, ctx),
      planned.agent?.id || undefined,
    );
    const parsed = fromAgent(payload);
    if (!parsed) return local();
    return { ...planned, ...parsed };
  } catch {
    return local();
  }
}
