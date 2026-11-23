import type { SidebarView } from '../components/Sidebar';

const VIEWS: SidebarView[] = [
  'dashboard',
  'calendar',
  'chores',
  'grocery',
  'meals',
  'tasks',
  'leaderboard',
  'music',
  'photos',
  'timer',
  'weather',
  'settings',
];

const VIEW_ALIASES: Record<string, SidebarView> = {
  home: 'dashboard',
  schedule: 'calendar',
  agenda: 'calendar',
  meals: 'meals',
  meal: 'meals',
  menu: 'meals',
  dinner: 'meals',
  shopping: 'grocery',
  groceries: 'grocery',
  list: 'grocery',
  lists: 'grocery',
  todo: 'tasks',
  todos: 'tasks',
  picture: 'photos',
  pictures: 'photos',
  photo: 'photos',
  clock: 'timer',
  countdown: 'timer',
};

export interface BeaconVoiceBody {
  response?: string;
  action?: string | null;
  success?: boolean;
  view?: string;
}

export interface VoiceCommandResult {
  response: string;
  success: boolean;
  route: 'home-assistant' | 'beacon';
  navigate: SidebarView | null;
  refreshChores: boolean;
}

export interface VoiceCommandDeps {
  addOn: boolean;
  listAgents: () => Promise<Array<{ id: string }>>;
  processConversation: (text: string) => Promise<unknown>;
  postBeaconVoice: (text: string) => Promise<BeaconVoiceBody>;
}

function cleanView(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[.?!,]+$/g, '')
    .replace(/\b(the|a|an|view|screen|page|tab)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Map a spoken view name onto a sidebar view. */
export function normalizeNavigateView(raw: unknown): SidebarView | null {
  if (typeof raw !== 'string') return null;
  const text = cleanView(raw);
  if (!text) return null;
  if (VIEW_ALIASES[text]) return VIEW_ALIASES[text];
  if ((VIEWS as string[]).includes(text)) return text as SidebarView;
  const first = text.split(' ')[0];
  if (VIEW_ALIASES[first]) return VIEW_ALIASES[first];
  if ((VIEWS as string[]).includes(first)) return first as SidebarView;
  return null;
}

/** "show the chores" → chores. Other phrases return null. */
export function navigationTargetFromUtterance(text: string): SidebarView | null {
  const match = text.trim().match(
    /^(?:please\s+)?(?:show|go to|open|switch to|navigate to)\s+(?:the\s+)?(.+)$/i,
  );
  if (!match) return null;
  return normalizeNavigateView(match[1]);
}

function navigationTargetFromSpeech(speech: string): SidebarView | null {
  const match = speech.trim().match(/^(?:switching to|navigating to)\s+(.+?)\.?$/i);
  if (!match) return null;
  return normalizeNavigateView(match[1]);
}

export function speechRecognitionAvailable(scope?: {
  isSecureContext?: boolean;
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
} | null): boolean {
  if (!scope || scope.isSecureContext === false) return false;
  return typeof scope.SpeechRecognition === 'function'
    || typeof scope.webkitSpeechRecognition === 'function';
}

function findSpeech(value: unknown, depth = 0): string {
  if (!value || typeof value !== 'object' || depth > 6) return '';
  const record = value as Record<string, unknown>;
  const plain = record.plain;
  if (plain && typeof plain === 'object' && typeof (plain as { speech?: unknown }).speech === 'string') {
    const speech = (plain as { speech: string }).speech.trim();
    if (speech) return speech;
  }
  if (typeof record.speech === 'string' && record.speech.trim()) return record.speech.trim();
  if (record.speech && typeof record.speech === 'object') {
    const nested = findSpeech(record.speech, depth + 1);
    if (nested) return nested;
  }
  for (const key of ['service_response', 'response', 'result']) {
    if (key in record) {
      const nested = findSpeech(record[key], depth + 1);
      if (nested) return nested;
    }
  }
  return '';
}

function findResponseType(value: unknown, depth = 0): string {
  if (!value || typeof value !== 'object' || depth > 6) return '';
  const record = value as Record<string, unknown>;
  if (typeof record.response_type === 'string') return record.response_type;
  for (const key of ['service_response', 'response', 'result']) {
    if (key in record) {
      const nested = findResponseType(record[key], depth + 1);
      if (nested) return nested;
    }
  }
  return '';
}

export function extractConversationSpeech(payload: unknown): string {
  return findSpeech(payload);
}

/** Assist answered. Errors and "I didn't understand" are not success. */
export function conversationSucceeded(payload: unknown): boolean {
  if (findResponseType(payload) === 'error') return false;
  const speech = findSpeech(payload);
  if (!speech) return false;
  if (/sorry|did(?:n't| not) understand|no intent|unable to/i.test(speech)) return false;
  return true;
}

/**
 * Add-on with a conversation agent → Home Assistant conversation.process.
 * Anything else, including a failed Assist reply, → POST /beacon-action/voice.
 */
export async function runVoiceCommand(text: string, deps: VoiceCommandDeps): Promise<VoiceCommandResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { response: '', success: false, route: 'beacon', navigate: null, refreshChores: false };
  }

  let useHa = false;
  if (deps.addOn) {
    try {
      const agents = await deps.listAgents();
      useHa = agents.length > 0;
    } catch {
      useHa = false;
    }
  }

  if (useHa) {
    try {
      const payload = await deps.processConversation(trimmed);
      if (conversationSucceeded(payload)) {
        const response = extractConversationSpeech(payload);
        return {
          response,
          success: true,
          route: 'home-assistant',
          navigate: navigationTargetFromUtterance(trimmed) || navigationTargetFromSpeech(response),
          refreshChores: true,
        };
      }
    } catch {
      // Assist didn't answer. The Beacon voice API still can.
    }
  }

  try {
    const body = await deps.postBeaconVoice(trimmed);
    const navigate = body.action === 'navigate'
      ? normalizeNavigateView(body.view)
      : null;
    const success = body.success !== false && body.action != null;
    return {
      response: body.response || (success ? 'Done.' : "Sorry, I didn't understand that."),
      success,
      route: 'beacon',
      navigate,
      refreshChores: success && (body.action === 'complete_chore' || body.action === 'add_item'),
    };
  } catch (err) {
    return {
      response: err instanceof Error ? err.message : 'Voice request failed.',
      success: false,
      route: 'beacon',
      navigate: null,
      refreshChores: false,
    };
  }
}
