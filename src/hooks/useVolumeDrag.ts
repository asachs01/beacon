import { useEffect, useRef, useState } from 'react';

/**
 * A volume slider's value while it's moved, for the Music screen and the
 * now-playing bar. The volume is set as the slider moves, but at most every
 * quarter second: every move used to be a Home Assistant service call,
 * dozens per drag. What's set shows until the player reports it back (or
 * for 3 s, if it never does: the player refused it, say). It used to go
 * back to the player's volume at any report, even mid-drag or one read
 * before the player had changed, so the slider jumped back to the old volume.
 *
 * `level` is the player's own volume; spread the returned handlers onto the
 * range input, with `value` as its value and `set` called on change.
 */
export function useVolumeDrag(level: number, onChange: (level: number) => void) {
  const [dragged, setDragged] = useState<number | null>(null);
  const lastSent = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout>>(undefined);
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined);
  const holding = useRef(false);
  useEffect(() => () => {
    clearTimeout(pending.current);
    clearTimeout(settle.current);
  }, []);

  const settleLater = () => {
    clearTimeout(settle.current);
    settle.current = setTimeout(() => { if (!holding.current) setDragged(null); }, 3000);
  };
  const release = () => {
    holding.current = false;
    settleLater();
  };

  const set = (value: number) => {
    setDragged(value);
    clearTimeout(pending.current);
    const wait = 250 - (Date.now() - lastSent.current);
    const send = () => {
      lastSent.current = Date.now();
      onChange(value);
    };
    if (wait <= 0) send();
    else pending.current = setTimeout(send, wait);
    settleLater();
  };

  useEffect(() => {
    if (!holding.current && dragged !== null && Math.abs(level - dragged) < 0.015) setDragged(null);
  }, [level, dragged]);

  return {
    value: dragged ?? level,
    set,
    onPointerDown: () => { holding.current = true; },
    onPointerUp: release,
    onPointerCancel: release,
  };
}
