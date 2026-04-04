import { useState, useCallback, useRef, useEffect } from 'react';
import { useKioskKeyboard } from '../hooks/useKioskKeyboard';

// --- Keyboard layouts ---

const LOWER = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['{shift}', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '{backspace}'],
  ['{numbers}', ',', '{space}', '.', '{enter}'],
];

const UPPER = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['{shift}', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '{backspace}'],
  ['{numbers}', ',', '{space}', '.', '{enter}'],
];

const NUMBERS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['@', '#', '$', '%', '&', '*', '-', '+', '(', ')'],
  ['!', '"', "'", ':', ';', '/', '?', '{backspace}'],
  ['{letters}', ',', '{space}', '.', '{enter}'],
];

type Layout = 'lower' | 'upper' | 'numbers';

const LAYOUTS: Record<Layout, string[][]> = {
  lower: LOWER,
  upper: UPPER,
  numbers: NUMBERS,
};

// Labels for special keys
const KEY_LABELS: Record<string, string> = {
  '{shift}': 'Shift',
  '{backspace}': 'Bksp',
  '{enter}': 'Enter',
  '{space}': ' ',
  '{numbers}': '123',
  '{letters}': 'ABC',
};

function getKeyClass(key: string, layout: Layout): string {
  const base = 'osk-key';
  switch (key) {
    case '{shift}':
      return `${base} osk-key--shift${layout === 'upper' ? ' osk-key--shift-active' : ''}`;
    case '{backspace}':
      return `${base} osk-key--wide osk-key--backspace`;
    case '{enter}':
      return `${base} osk-key--enter`;
    case '{space}':
      return `${base} osk-key--space`;
    case '{numbers}':
    case '{letters}':
      return `${base} osk-key--toggle`;
    default:
      return base;
  }
}

/**
 * Insert text into the active input at its current cursor position,
 * using native setter + InputEvent to work with React controlled inputs.
 */
function insertAtCursor(el: HTMLInputElement | HTMLTextAreaElement, text: string) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const before = el.value.slice(0, start);
  const after = el.value.slice(end);
  const newValue = before + text + after;

  // Use the native setter so React sees the change
  const nativeSetter = Object.getOwnPropertyDescriptor(
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
    'value',
  )?.set;

  if (nativeSetter) {
    nativeSetter.call(el, newValue);
  } else {
    el.value = newValue;
  }

  // Fire input event so React's onChange fires
  el.dispatchEvent(new Event('input', { bubbles: true }));

  // Restore cursor position
  const newPos = start + text.length;
  el.setSelectionRange(newPos, newPos);
}

function deleteAtCursor(el: HTMLInputElement | HTMLTextAreaElement) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;

  let newValue: string;
  let newPos: number;

  if (start !== end) {
    // Delete selection
    newValue = el.value.slice(0, start) + el.value.slice(end);
    newPos = start;
  } else if (start > 0) {
    // Delete character before cursor
    newValue = el.value.slice(0, start - 1) + el.value.slice(start);
    newPos = start - 1;
  } else {
    return; // nothing to delete
  }

  const nativeSetter = Object.getOwnPropertyDescriptor(
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
    'value',
  )?.set;

  if (nativeSetter) {
    nativeSetter.call(el, newValue);
  } else {
    el.value = newValue;
  }

  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.setSelectionRange(newPos, newPos);
}

export function OnScreenKeyboard() {
  const { showKeyboard, activeInput, dismiss } = useKioskKeyboard();
  const [layout, setLayout] = useState<Layout>('lower');
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const pressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset layout when keyboard opens
  useEffect(() => {
    if (showKeyboard) {
      setLayout('lower');
    }
  }, [showKeyboard]);

  const handleKey = useCallback(
    (key: string) => {
      if (!activeInput) return;

      // Visual feedback
      setPressedKey(key);
      if (pressTimeoutRef.current) clearTimeout(pressTimeoutRef.current);
      pressTimeoutRef.current = setTimeout(() => setPressedKey(null), 120);

      switch (key) {
        case '{shift}':
          setLayout((prev) => (prev === 'upper' ? 'lower' : 'upper'));
          break;
        case '{backspace}':
          deleteAtCursor(activeInput);
          break;
        case '{enter}':
          // For single-line inputs, submit the form or blur
          if (activeInput instanceof HTMLInputElement) {
            const form = activeInput.form;
            if (form) {
              form.requestSubmit();
            }
            dismiss();
          } else {
            // Textarea: insert newline
            insertAtCursor(activeInput, '\n');
          }
          break;
        case '{space}':
          insertAtCursor(activeInput, ' ');
          break;
        case '{numbers}':
          setLayout('numbers');
          break;
        case '{letters}':
          setLayout('lower');
          break;
        default:
          insertAtCursor(activeInput, key);
          // Auto-lowercase after typing a character while shifted
          if (layout === 'upper') {
            setLayout('lower');
          }
          break;
      }
    },
    [activeInput, layout, dismiss],
  );

  // Prevent mousedown on keys from stealing focus from the input
  const preventBlur = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
  }, []);

  const rows = LAYOUTS[layout];

  return (
    <>
      {/* Semi-transparent backdrop */}
      <div
        className={`osk-backdrop${showKeyboard ? ' osk-backdrop--visible' : ''}`}
        onClick={dismiss}
      />

      {/* Keyboard container */}
      <div
        className={`osk-container${showKeyboard ? ' osk-container--visible' : ''}`}
        onMouseDown={preventBlur}
        onTouchStart={preventBlur}
      >
        <div className="osk-toolbar">
          <button className="osk-close-btn" onMouseDown={preventBlur} onClick={dismiss}>
            Close
          </button>
        </div>

        {rows.map((row, ri) => (
          <div className="osk-row" key={ri}>
            {row.map((key) => (
              <button
                key={key}
                className={`${getKeyClass(key, layout)}${pressedKey === key ? ' osk-key--pressed' : ''}`}
                onClick={() => handleKey(key)}
                onMouseDown={preventBlur}
                onTouchStart={preventBlur}
              >
                {KEY_LABELS[key] ?? key}
              </button>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
