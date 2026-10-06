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
      } catch (err) {
        clearTimeout(timer);
        // A slow answer is not an outage: under heavy machine load (a test run,
        // a build) Vite can take longer than the timeout, and the banner then
        // claimed the server was down while it was serving. Only a failed
        // connection says so; a timed-out check leaves the state as it was.
        if ((err as { name?: string })?.name === 'AbortError') return;
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
