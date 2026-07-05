export interface FamilyMember {
  id: string;
  name: string;
  avatar: string; // emoji or image URL
  color: string; // hex color
  pin?: string; // 4-6 digit PIN
  role: 'parent' | 'child';
  calendar_entity?: string; // HA calendar entity_id
}

export interface Chore {
  id: string;
  name: string;
  assigned_to: string[]; // member IDs
  frequency: 'daily' | 'weekly' | 'once';
  value_cents: number;
  icon?: string; // emoji
}

export interface ChoreCompletion {
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

/** Flat list of all avatar emojis (for backwards compat) */
export const AVATAR_OPTIONS = AVATAR_CATEGORIES.flatMap((c) => c.emojis);
