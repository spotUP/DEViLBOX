import { describe, it, expect } from 'vitest';
import { VENDORS, checkOpenRouterKey, listVendorModels, pickModel } from './vendors';
import { openAiAdapter, openRouterAdapter } from './openRouterAdapter';

const stub = (status: number, body: unknown): typeof fetch => async () => new Response(JSON.stringify(body), { status });

describe('pickModel', () => {
  const pref = ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-sonnet'];
  it('requested wins when listed, else exact preferred, else prefix, else first', () => {
    expect(pickModel(['a', 'b'], pref, 'b')).toBe('b');
    expect(pickModel(['claude-haiku-5-5', 'claude-sonnet-5-5'], pref, 'nope')).toBe('claude-sonnet-5-5');
    expect(pickModel(['x', 'claude-sonnet-4-9'], pref)).toBe('claude-sonnet-4-9');
    expect(pickModel(['x', 'y'], pref)).toBe('x');
    expect(pickModel([], pref)).toBeNull();
  });
});

describe('listVendorModels', () => {
  it('OpenAI: only chat models are kept', async () => {
    const ids = ['gpt-5-mini', 'o3', 'gpt-4o-audio-preview', 'gpt-4o-realtime-preview', 'text-embedding-3-small', 'whisper-1', 'dall-e-3', 'gpt-image-1', 'tts-1', 'gpt-4o-transcribe'];
    const got = await listVendorModels('openai', 'k', stub(200, { data: ids.map((id) => ({ id })) }));
    expect(got).toEqual(['gpt-5-mini', 'o3']);
  });
  it('Anthropic: keeps every id; a 401 throws the vendor words', async () => {
    expect(await listVendorModels('anthropic', 'k', stub(200, { data: [{ id: 'claude-sonnet-5-5' }] }))).toEqual(['claude-sonnet-5-5']);
    await expect(listVendorModels('anthropic', 'k', stub(401, { error: { message: 'bad' } }))).rejects.toMatchObject({ kind: 'auth' });
  });
  it('headers carry the key the vendor expects', () => {
    expect(VENDORS.anthropic.headers('K')).toMatchObject({ 'x-api-key': 'K', 'anthropic-version': '2023-06-01' });
    expect(VENDORS.openai.headers('K')).toEqual({ Authorization: 'Bearer K' });
  });
});

describe('checkOpenRouterKey', () => {
  // Mirrors the live API (probed 2026-10-16): /models is public and answers 200 for any key; /key answers 401 for a bad one.
  const openRouter = (validKey: string) => (async (url: string | URL | Request, init?: RequestInit) => {
    const auth = new Headers(init?.headers).get('Authorization');
    if (String(url).endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'a:free' }, { id: 'b:free' }] }), { status: 200 });
    if (String(url).endsWith('/key')) return auth === `Bearer ${validKey}` ? new Response(JSON.stringify({ data: { label: 'k' } }), { status: 200 }) : new Response('{}', { status: 401 });
    return new Response('{}', { status: 404 });
  }) as typeof fetch;

  it('rejects a made-up key even though the public model list answers', async () => {
    await expect(checkOpenRouterKey('sk-or-invalid-test-000', openRouter('sk-or-good'))).rejects.toMatchObject({ kind: 'auth' });
  });
  it('accepts a real key and reports the model count', async () => {
    expect(await checkOpenRouterKey('sk-or-good', openRouter('sk-or-good'))).toBe(2);
  });
});

describe('OpenAI via the shared chat-completions factory', () => {
  const req = { model: 'm', messages: [], tools: [], withTools: false, maxTokens: 9 };
  it('uses max_completion_tokens, OpenRouter keeps max_tokens', () => {
    expect(openAiAdapter.buildRequest(req)).toMatchObject({ max_completion_tokens: 9 });
    expect(openAiAdapter.buildRequest(req)).not.toHaveProperty('max_tokens');
    expect(openRouterAdapter.buildRequest(req)).toMatchObject({ max_tokens: 9 });
  });
  it('429 insufficient_quota is credit, another 429 is rate, errors name OpenAI', () => {
    expect(openAiAdapter.mapError(429, { error: { code: 'insufficient_quota', message: 'x' } }).kind).toBe('credit');
    expect(openAiAdapter.mapError(429, { error: { message: 'slow' } }).kind).toBe('rate');
    expect(openAiAdapter.mapError(401, null).message).toContain('The OpenAI key was rejected');
    expect(openRouterAdapter.mapError(401, null).message).toContain('The OpenRouter key was rejected');
  });
});
