export interface FamilyMember {
  id: string;
  name: string;
  avatar: string; // emoji or image URL
  color: string; // hex color
  has_pin?: boolean; // server reports whether a PIN is set, never its value
  role: 'parent' | 'child';
  calendar_entity?: string; // HA calendar entity_id (primary calendar)
  /** Additional HA calendar entity_ids linked to this member (e.g. a
   *  kid's sports team calendar), so their events group under this member
   *  too instead of falling into the "Other" bucket. `calendar_entity`
   *  remains the primary/back-compat single-calendar field. */
  additional_calendar_entities?: string[];
}

export type FamilyMemberInput = Omit<FamilyMember, 'id' | 'has_pin'> & { pin?: string };

export interface Chore {
  id: string;
  name: string;
  assigned_to: string[]; // member IDs
  frequency: 'daily' | 'weekly' | 'once';
  value_cents: number;
  icon?: string; // emoji
}

export interface ChoreCompletion {
  id?: string; // present on completions created via the collection API
  chore_id: string;
  member_id: string;
  completed_at: string; // ISO date string for serialization
  verified_by?: string; // member ID of verifying parent
}

export interface Streak {
  member_id: string;
  current: number;
  longest: number;
  last_completed: string; // ISO date string
}

export interface Routine {
  id: string;
  name: string;
  member_id: string;
  tasks: RoutineTask[];
  time_of_day: 'morning' | 'afternoon' | 'evening';
}

export interface RoutineTask {
  id: string;
  name: string;
  order: number;
}

/** A member checking off one routine task on one day (mirrors ChoreCompletion) */
export interface RoutineTaskCompletion {
  id?: string; // present on completions created via the collection API
  routine_id: string;
  task_id: string;
  member_id: string;
  completed_at: string; // ISO date string for serialization
}

/** Earnings for a member over a time period */
export interface MemberEarnings {
  member_id: string;
  total_cents: number;
  chore_count: number;
}

/** Non-monetary "star" unit, selectable alongside currency symbols in
 *  Settings → Chores → Rewards for families that prefer points over money. */
export const STAR_CURRENCY = '\u2b50';

/** Format a chore's value_cents for display, honoring the star-currency
 *  option. In star mode the underlying value_cents is still the storage
 *  unit (so existing chore data / math is unchanged) but it's presented as
 *  a whole-number star count rather than a monetary amount with decimals. */
export function formatChoreValue(cents: number, currencySymbol: string): string {
  if (cents === 0) return '';
  if (currencySymbol === STAR_CURRENCY) {
    const stars = Math.round(cents / 100);
    return `${stars} ${STAR_CURRENCY}`;
  }
  return `${currencySymbol}${(cents / 100).toFixed(2)}`;
}

/** Color palette for family member assignment */
export const MEMBER_COLORS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#a855f7', // purple
  '#f97316', // orange
  '#ec4899', // pink
  '#14b8a6', // teal
  '#eab308', // yellow
  '#ef4444', // red
  '#6366f1', // indigo
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#f43f5e', // rose
  '#8b5cf6', // violet
  '#d946ef', // fuchsia
  '#0ea5e9', // sky
  '#fb923c', // amber
  '#2dd4bf', // mint
  '#a3e635', // chartreuse
  '#c084fc', // lavender
  '#38bdf8', // light blue
] as const;

/** Avatar categories for the picker UI */
export interface AvatarCategory {
  label: string;
  emojis: string[];
}

export const AVATAR_CATEGORIES: AvatarCategory[] = [
  {
    label: 'People',
    emojis: [
      '👦', '👧', '👨', '👩', '👴', '👵', '🧑', '👶', '🧒', '👸', '🤴', '🦸',
      '👩‍🦰', '👨‍🦱', '🧔', '👱', '👩‍🦳', '👨‍🦳', '👩‍🦲', '🧑‍🦱',
      '🧑‍🦰', '🧑‍🦳', '👮', '🧙', '🧝', '🧛', '🧜', '🧚', '🦹', '🥷',
      '👼', '🤠', '🥸', '🤓', '😎', '🧑‍🚀', '🧑‍🎤', '🧑‍🎓', '🧑‍🍳', '🧑‍🔧',
    ],
  },
  {
    label: 'Animals',
    emojis: [
      '🐶', '🐱', '🐰', '🦊', '🐻', '🐼', '🦁', '🐮', '🐷', '🐸',
      '🦉', '🐝', '🦋', '🐢', '🐙', '🐧', '🦄', '🐬', '🐳', '🦈',
      '🦅', '🦜', '🐺', '🦝', '🐿️', '🦔', '🐾', '🦩', '🦖', '🐉',
    ],
  },
  {
    label: 'Nature',
    emojis: [
      '🌸', '🌻', '🌺', '🍀', '🌈', '⭐', '🌙', '☀️', '🔥',
      '❄️', '🌊', '⚡', '🌍', '🪐', '💫', '🍂', '🌿', '🌴',
    ],
  },
  {
    label: 'Sports & Hobbies',
    emojis: [
      '⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏒', '🎸', '🎹', '🎨',
      '🎮', '🎯', '🎳', '🏄', '🚴', '🏋️', '🤸', '⛷️', '🏊', '🧗',
    ],
  },
  {
    label: 'Objects',
    emojis: [
      '🚀', '🎭', '🎪', '🎠', '🏰', '🗽', '⛺', '🎡', '🎢',
      '💎', '🔮', '🎀', '🧸', '🎒', '👑', '🦺', '🧢', '👓',
    ],
  },
  {
    label: 'Food',
    emojis: [
      '🍕', '🍦', '🧁', '🍩', '🎂', '🍔', '🌮', '🍣', '🥑',
      '🍪', '🧇', '🍫', '☕', '🧋', '🍓', '🍉', '🥝', '🍑',
    ],
  },
];
