import { useEffect, useState } from 'react';

/**
 * Polls the dev server every `intervalMs` ms to detect when it goes down.
 * Only active in dev mode — always returns false in production.
 */
export function useDevServerStatus(intervalMs = 5000): boolean {
  const [isDown, setIsDown] = useState(false);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    let cancelled = false;

    const check = async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      try {
        await fetch('/', { cache: 'no-cache', signal: controller.signal });
        clearTimeout(timer);
        if (!cancelled) setIsDown(false);
      } catch {
        clearTimeout(timer);
        if (!cancelled) setIsDown(true);
      }
    };

    check();
    const interval = setInterval(check, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [intervalMs]);

  return isDown;
}
