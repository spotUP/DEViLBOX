/**
 * Public-endpoint limits for POST /api/ai/chat.
 *
 * The site is public and the Free provider spends a shared OpenRouter quota,
 * so: a per-IP rate per minute and per day, one Free chat in flight per IP, a
 * site-wide concurrency cap, a prompt length cap, and the CLI providers
 * refused unless AI_CLI_PROVIDERS=1 (on a public box they are an
 * unauthenticated CLI spawn).
 *
 * Every number is overridable by environment variable and read when the
 * guards are built. A request that brings its own OpenRouter key skips the
 * DAILY cap (its own quota pays) but keeps the per-minute limit and the
 * concurrency cap.
 */
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { AI_PROVIDER_IDS } from './cliProviders';

export const DEFAULT_PER_MINUTE = 10;
export const DEFAULT_PER_DAY = 100;
export const DEFAULT_CONCURRENT = 8;
export const MAX_PROMPT_CHARS = 4000;
export const OPENROUTER_KEY_HEADER = 'x-openrouter-key';

const envInt = (name: string, fallback: number): number => {
  const n = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * Proxy hops between the visitor and Express, for `app.set('trust proxy', n)`.
 * The per-IP limits key on req.ip, which is only the visitor's address when n
 * matches the deploy chain: live is Caddy -> nginx -> Express (2), the plain
 * compose stack is nginx -> Express (1). Too low and every visitor shares the
 * last proxy's address, so one daily cap for the whole site; too high and a
 * visitor can spoof X-Forwarded-For.
 */
export function trustProxyHops(): number {
  return envInt('TRUST_PROXY_HOPS', 1);
}

/** The visitor's own OpenRouter key from the request, or undefined. Never log it. */
export function visitorKey(req: { header(name: string): string | undefined }): string | undefined {
  const v = req.header(OPENROUTER_KEY_HEADER)?.trim();
  return v ? v : undefined;
}

/** The provider a chat body asks for; Free is the default. */
export function requestedProvider(body: unknown): string {
  const p = (body as { provider?: unknown } | undefined)?.provider;
  return typeof p === 'string' && p ? p : 'free';
}

/** What refuse() needs of a response (structural: the root and server express typings are separate copies). */
interface RefusableResponse {
  status(code: number): unknown;
  set(headers: Record<string, string>): unknown;
  write(chunk: string): unknown;
  end(): unknown;
}

function refuse(res: RefusableResponse, status: number, message: string): void {
  res.status(status);
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  res.write(`data: ${JSON.stringify({ type: 'error', error: message })}\n\n`);
  res.end();
}

export function createAiGuards(): Router {
  const perMinute = envInt('AI_RATE_PER_MINUTE', DEFAULT_PER_MINUTE);
  const perDay = envInt('AI_RATE_PER_DAY', DEFAULT_PER_DAY);
  const maxConcurrent = envInt('AI_MAX_CONCURRENT', DEFAULT_CONCURRENT);
  const router = Router();

  // 1. CLI providers off on a public box; a bad prompt rejected before it costs anything.
  router.post('/chat', (req: Request, res: Response, next: NextFunction) => {
    const provider = requestedProvider(req.body);
    const isCli = (AI_PROVIDER_IDS as string[]).includes(provider);
    if (provider !== 'free' && !isCli) return refuse(res, 400, `Unknown provider: ${provider.slice(0, 40)}`);
    if (isCli && process.env.AI_CLI_PROVIDERS !== '1') {
      return refuse(res, 403, 'CLI providers are disabled on this server. Choose Free, or set AI_CLI_PROVIDERS=1 on a trusted dev machine.');
    }
    const prompt = (req.body as { prompt?: unknown } | undefined)?.prompt;
    if (typeof prompt === 'string' && prompt.length > MAX_PROMPT_CHARS) {
      return refuse(res, 400, `The prompt is longer than ${MAX_PROMPT_CHARS} characters.`);
    }
    next();
  });

  // 2. Rates per IP.
  // express-rate-limit resolves a second copy of @types/express; the cast bridges the two.
  const limited = (windowMs: number, limit: number, what: string, skip?: (req: { header(name: string): string | undefined }) => boolean): RequestHandler => rateLimit({
    windowMs, limit, skip, standardHeaders: true, legacyHeaders: false,
    handler: (_req, res) => refuse(res, 429, `Too many AI requests (${what}). Try again later.`),
  }) as unknown as RequestHandler;
  router.post('/chat', limited(60 * 1000, perMinute, `limit ${perMinute} per minute`));
  router.post('/chat', limited(24 * 60 * 60 * 1000, perDay, `limit ${perDay} per day; add your own OpenRouter key in Settings to lift it`, (req) => !!visitorKey(req)));

  // 3. One Free chat in flight per IP, and a site-wide cap.
  const inFlightIps = new Set<string>();
  let inFlight = 0;
  router.post('/chat', (req: Request, res: Response, next: NextFunction) => {
    if (requestedProvider(req.body) !== 'free') return next();
    const ip = req.ip ?? 'unknown';
    if (inFlightIps.has(ip)) return refuse(res, 429, 'You already have an AI chat running. Wait for it to finish.');
    if (inFlight >= maxConcurrent) return refuse(res, 429, 'The AI is busy. Try again in a moment.');
    inFlightIps.add(ip);
    inFlight++;
    res.once('close', () => { inFlightIps.delete(ip); inFlight--; });
    next();
  });

  return router;
}
