/**
 * A value the user steps through quickly (arrow presses, hold-to-repeat) where each commit is expensive (a subsong
 * switch reopens and rescans the song). The control shows the pending value at once; `commit` runs once, `delayMs`
 * after the last change, with the value the user settled on. A settled value equal to the committed one is not
 * committed again.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export function useDebouncedCommit(
  committed: number,
  commit: (value: number) => void,
  delayMs: number,
): [shown: number, change: (value: number) => void] {
  const [pending, setPending] = useState<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const committedRef = useRef(committed);
  committedRef.current = committed;

  useEffect(() => () => { if (timerRef.current !== null) clearTimeout(timerRef.current); }, []);

  const change = useCallback((value: number) => {
    setPending(value);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setPending(null);
      if (value !== committedRef.current) commitRef.current(value);
    }, delayMs);
  }, [delayMs]);

  return [pending ?? committed, change];
}
