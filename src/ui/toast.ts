import type { TranslationKey } from '../i18n';

export interface ToastNotice {
  id: number;
  messageKey: TranslationKey;
}

type Listener = (notice: ToastNotice) => void;

const listeners = new Set<Listener>();
let nextId = 1;

/** Show a short message. ToastHost renders it; tests can subscribe directly. */
export function showToast(messageKey: TranslationKey): void {
  const notice = { id: nextId, messageKey };
  nextId += 1;
  for (const listener of listeners) listener(notice);
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
