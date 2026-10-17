/**
 * The ONE place that decides where the server's API lives. Every client
 * (fetch wrappers, stores, workers, engine code) imports `API_URL` from here;
 * none may read `VITE_API_URL` itself. The value ends in `/api`, so consumers
 * append paths such as `/ai/status`.
 *
 * `VITE_API_URL` is INLINED by Vite at build time, and the repo's `.env` sets
 * it to `http://localhost:3011/api` so a dev browser talks to the local
 * server. CI never sees that file, so a CI build compiles in the fallback
 * below and works for everyone.
 *
 * A build run on a developer's machine compiles in LOCALHOST. Deployed, the
 * site then asks each visitor's own computer for the modland index and every
 * other API call: "failed to fetch" for all of them. That shipped on
 * 2026-09-18 from a hand-run deploy while GitHub Actions was down for billing.
 * A second variant: about twenty files each had their own copy of this line,
 * and the AI panel's copy fell back to `http://localhost:3001`, so the live
 * site showed "Cannot reach server" (one copy is enough to break production).
 *
 * Guarded in three places, because the value is invisible once inlined:
 * `scripts/deploy-manual.sh` forces the production value and refuses to sync a
 * bundle that still mentions the dev port, and
 * `src/lib/__tests__/deployBundle.test.ts` checks the fallback here, that no
 * other source file reads `VITE_API_URL`, and any `dist/` that happens to exist.
 */
export const API_URL = import.meta.env.VITE_API_URL || 'https://devilbox.uprough.net/api';
