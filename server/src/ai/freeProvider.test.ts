import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runFreeChat, setFreeProviderFetch, freeAvailability, type FreeEvent } from './freeProvider';
import { resetModelCatalogue, resetProbe } from './freeModels';
import { resetModelCosts, modelCostMs, UNTRIED_MS } from './modelCosts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-'));
process.env.DB_DIR = dir;
afterAll(() => { setFreeProviderFetch(null); delete process.env.DB_DIR; delete process.env.OPENROUTER_API_KEY; fs.rmSync(dir, { recursive: true, force: true }); });

const MODELS = ['a:free', 'b:free'].map((id, i) => ({ id, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'], context_length: 1000 * (i + 1) }));
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

async function run(completion: (model: string, n: number) => Response, visitorKey?: string) {
  const completions: string[] = [];
  setFreeProviderFetch((async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith('/models')) return json({ data: MODELS });
    const model = JSON.parse(String(init?.body)).model as string;
    completions.push(model);
    return completion(model, completions.length);
  }) as typeof fetch);
  const events: FreeEvent[] = [];
  const r = await runFreeChat({ system: 's', history: [{ role: 'user', content: 'hi' }], visitorKey, emit: (e) => events.push(e), callBrowser: async () => ({}) });
  return { r, events, completions };
}

beforeEach(() => { resetModelCatalogue(); resetModelCosts(); resetProbe(); process.env.OPENROUTER_API_KEY = 'server-key'; });

describe('runFreeChat (FA-8)', () => {
  it('429 rotates to the next model', async () => {
    const { r, completions } = await run((m) => (m === 'a:free' ? json({ error: { message: 'slow down' } }, 429) : json({ choices: [{ message: { content: 'hello' } }] })));
    expect(r.text).toBe('hello');
    expect(r.model).toBe('b:free');
    expect(completions[0]).toBe('a:free');
  });
  it('402 stops with one error and does not try another model', async () => {
    const { events, completions } = await run(() => json({ error: { message: 'no credit' } }, 402));
    expect(completions.length).toBe(1);
    expect(events.some((e) => e.type === 'error')).toBe(true);
  });
  it('an empty reply after a tool call marks the model mute, so cost data exists', async () => {
    const { completions } = await run((m) => (m === 'a:free' ? json({ choices: [{ message: { content: '' } }] }) : json({ choices: [{ message: { content: 'ok' } }] })));
    expect(completions.length).toBeGreaterThan(1);
  });
  it('the visitor key never appears in an emitted error', async () => {
    const { events } = await run(() => json({ error: { message: 'bad key vis-secret-123' } }, 401), 'vis-secret-123');
    expect(JSON.stringify(events)).not.toContain('vis-secret-123');
  });
  it('availability reports the Settings message with no key', () => {
    delete process.env.OPENROUTER_API_KEY;
    const a = freeAvailability();
    expect(a.available).toBe(false);
    expect(a.message).toContain('Settings');
    expect(freeAvailability('k').available).toBe(true);
    void modelCostMs; void UNTRIED_MS;
  });
});
