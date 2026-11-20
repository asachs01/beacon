import { loadFontSelection } from './load';
import {
  DEFAULT_BODY_FONT,
  DEFAULT_HEADING_FONT,
  FONT_LOAD_TIMEOUT_MS,
  SYSTEM_FONT_STACK,
  intendedStack,
  normalizeFontSelection,
  selectionNeedsLoad,
  type FontSelection,
} from './selection';

export interface ResolvedFont {
  stack: string;
  fellBack: boolean;
}

export interface FontApplyStatus {
  headingFellBack: boolean;
  bodyFellBack: boolean;
}

export interface FontRuntime {
  load(selection: FontSelection): Promise<void>;
  timeoutMs: number;
}

export const defaultFontRuntime: FontRuntime = {
  timeoutMs: FONT_LOAD_TIMEOUT_MS,
  load: loadFontSelection,
};

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Resolve one choice to a CSS font-family stack.
 * FontFace errors and timeouts come back as the system stack with `fellBack`.
 */
export async function resolveFontStack(
  selection: FontSelection,
  runtime: FontRuntime = defaultFontRuntime,
): Promise<ResolvedFont> {
  const intended = intendedStack(selection);
  if (!selectionNeedsLoad(selection)) {
    return { stack: intended, fellBack: false };
  }
  try {
    await withTimeout(runtime.load(selection), runtime.timeoutMs);
    return { stack: intended, fellBack: false };
  } catch {
    return { stack: SYSTEM_FONT_STACK, fellBack: true };
  }
}

let applyGeneration = 0;

function writeStacks(headingStack: string, bodyStack: string): void {
  const root = document.documentElement;
  root.style.setProperty('--font-family-heading', headingStack);
  root.style.setProperty('--font-family-body', bodyStack);
}

/**
 * Apply heading and body choices on `:root`. A newer call supersedes an older
 * one so a slow Google Font can't overwrite a selection the user already changed.
 * Returns null when this call was superseded.
 */
export async function applyFontPreferences(
  heading: FontSelection,
  body: FontSelection,
  runtime: FontRuntime = defaultFontRuntime,
): Promise<FontApplyStatus | null> {
  const token = ++applyGeneration;
  const current = () => token === applyGeneration;

  if (!current()) return null;
  writeStacks(intendedStack(heading), intendedStack(body));

  const [headingResolved, bodyResolved] = await Promise.all([
    resolveFontStack(heading, runtime),
    resolveFontStack(body, runtime),
  ]);
  if (!current()) return null;
  writeStacks(headingResolved.stack, bodyResolved.stack);
  return {
    headingFellBack: headingResolved.fellBack,
    bodyFellBack: bodyResolved.fellBack,
  };
}

/** Apply the locally cached choice before React paints, then let settings reconcile. */
export function bootstrapStoredFonts(): void {
  let heading = DEFAULT_HEADING_FONT;
  let body = DEFAULT_BODY_FONT;
  try {
    const raw = localStorage.getItem('beacon-settings');
    if (raw) {
      const parsed = JSON.parse(raw) as { headingFont?: unknown; bodyFont?: unknown };
      heading = normalizeFontSelection(parsed.headingFont, DEFAULT_HEADING_FONT);
      body = normalizeFontSelection(parsed.bodyFont, DEFAULT_BODY_FONT);
    }
  } catch {
    heading = DEFAULT_HEADING_FONT;
    body = DEFAULT_BODY_FONT;
  }
  void applyFontPreferences(heading, body);
}
