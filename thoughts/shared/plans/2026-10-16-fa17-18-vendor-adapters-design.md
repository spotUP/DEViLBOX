---
date: 2026-10-16
topic: FA-17 Anthropic adapter, FA-18 OpenAI adapter (server side)
status: design, ready to implement
parent: thoughts/shared/plans/2026-10-16-free-ai-provider.md
---

# FA-17 / FA-18 server design

Scope here: server only (`server/src/ai/**`, `server/src/routes/ai.ts`). The client
providers and key fields come after FA-16 lands (it owns `useAIStore`, `AIKeysPanel`).

## Invariants (must hold)

- A visitor key is used for that one request only: never stored, never logged, never
  echoed. Every error message passes through `scrub(message, key)` before `emit`.
- Anthropic and OpenAI chats use ONLY the visitor's key (header). There is no server
  key for these vendors. No key: one SSE `error` "Add your Anthropic key in Settings
  (AI Help) to use Claude." (OpenAI likewise), no network call.
- `toolLoop.ts` stays vendor-neutral and unedited.
- No duplicated wire-format code: OpenAI and OpenRouter share ONE chat-completions
  adapter implementation.

## 1. Shared chat-completions adapter (refactor, OpenRouter behaviour unchanged)

`openRouterAdapter.ts` becomes a factory plus the existing export:

```ts
export function chatCompletionsAdapter(o: { vendor: string; maxTokensField: 'max_tokens' | 'max_completion_tokens'; mapStatus?: (status, body, note) => ProviderError | null }): LoopAdapter
export const openRouterAdapter = chatCompletionsAdapter({ vendor: 'OpenRouter', maxTokensField: 'max_tokens' });
```

Error text uses `o.vendor` ("The OpenAI key was rejected..."). Keep every existing
OpenRouter message identical (tests assert them). Rename the file only if trivial;
otherwise keep the file name and add the factory.

## 2. OpenAI (FA-18) = the factory with

- `vendor: 'OpenAI'`, `maxTokensField: 'max_completion_tokens'` (newer models reject `max_tokens`).
- Error map: 401/403 auth; 429 with `error.code === 'insufficient_quota'` (or type) is
  `credit` ("OpenAI reports no credit or quota left"); other 429 rate; 400 bad-request; >=500 server.
- Base `https://api.openai.com/v1`, header `Authorization: Bearer <key>`.
- Models: `GET /v1/models` -> `{ data: [{ id }] }`.

## 3. Anthropic (FA-17) new `anthropicAdapter.ts`

Messages API, `POST https://api.anthropic.com/v1/messages`, headers `x-api-key: <key>`,
`anthropic-version: 2023-06-01`, `content-type: application/json`.

- `startMessages(system, history)`: returns `[{ role: 'system', content: system }, ...history]`.
  The system entry is adapter-internal: `buildRequest` lifts it to top-level `system`
  and sends only the rest as `messages`.
- `buildRequest`: `{ model, max_tokens, system, messages, tools?, tool_choice? }`.
  Tools map `{ name, description, input_schema: t.inputSchema }`.
  `withTools` true: `tool_choice: { type: 'auto' }`. `withTools` false BUT the messages
  already hold `tool_use` / `tool_result` blocks: still send `tools` (the API rejects
  tool blocks without a tools definition) with `tool_choice: { type: 'none' }`.
  `withTools` false and no tool blocks: omit both.
- `parseReply(raw)`: `content` array; text = joined `type: 'text'` blocks (trim, null when
  empty); toolCalls = `type: 'tool_use'` blocks `{ id, name, args: input }`;
  `truncated = stop_reason === 'max_tokens'`.
- `appendToolTurn`: push `{ role: 'assistant', content: [text block if text, ...tool_use blocks] }`,
  then ONE `{ role: 'user', content: [{ type: 'tool_result', tool_use_id, content, is_error: !ok }, ...] }`.
- `appendUserNudge`: if the last message is a user message with array content, append a
  `{ type: 'text', text }` block to it (keeps role alternation); else push a user message.
- `mapError(status, body)`: detail from `body.error.message`. 401 auth ("The Anthropic key
  was rejected"); 403 auth; 400 whose message mentions "credit balance" is `credit`
  ("Anthropic reports no credit"); other 400 bad-request; 429 rate; 529 and >=500 server.
- Models: `GET https://api.anthropic.com/v1/models` (same headers) -> `{ data: [{ id }] }`.

## 4. Shared POST + vendor table

- Move `makePost` out of `freeProvider.ts` into `vendorPost.ts`:
  `makeJsonPost({ url, headers, vendor, adapter, signal, fetch })`. The free provider uses
  it with the OpenRouter URL/headers; keep the OpenRouter "200 with embedded error"
  check (generic: harmless for others). Network error message names the vendor
  ("Could not reach Anthropic").
- New `vendors.ts`:
  ```ts
  export type VendorId = 'anthropic' | 'openai';
  export const VENDOR_KEY_HEADER: Record<VendorId, string> = { anthropic: 'x-anthropic-key', openai: 'x-openai-key' };
  interface Vendor { id; label; chatUrl; modelsUrl; headers(key); adapter; preferredModels: string[]; noKeyMessage }
  export async function listVendorModels(id, key, fetch, signal?): Promise<string[]>  // throws ProviderError via adapter.mapError
  export function pickModel(available: string[], preferred: string[], requested?: string): string | null
  ```
  `pickModel`: requested if present in `available`; else the first preferred id present;
  else the first preferred PREFIX match (`claude-sonnet`, `gpt-5-mini`...); else `available[0]`.
  Preferred: anthropic `['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-sonnet', 'claude-haiku']`;
  openai `['gpt-5-mini', 'gpt-5', 'gpt-4.1-mini', 'gpt-4o-mini']`. For OpenAI filter the
  list to chat models (`gpt-` / `o` prefix, exclude `-audio`, `-realtime`, `-transcribe`,
  `-tts`, `-image`, `embedding`, `whisper`, `dall-e`).
- `limits.ts`: `vendorKey(req, id)` reads `VENDOR_KEY_HEADER[id]` (trimmed, undefined when empty).

## 5. Runner `vendorChat.ts`

```ts
export async function runVendorChat(opts: { vendor: VendorId; system; history; visitorKey?; requestedModel?; emit; callBrowser; signal?; deadlineMs? }): Promise<{ text: string | null; model: string | null }>
```
1. No key: emit error `noKeyMessage`, return (no fetch).
2. `listVendorModels` (auth/credit errors surface here with the vendor's words); `pickModel`.
3. `createFreeToolset(callBrowser)` (rename not required); `askWithTools` with the vendor
   adapter and `makeJsonPost`; `maxTokens` 1024. On `bad-request` retry once with `tools: []`.
   `toolset.close()` in `finally`.
4. Success: emit `model`, `text`, `done` exactly like the free provider. Failure: emit
   scrubbed error. Aborted: return quietly.

Shared emit/scrub/toolset lifecycle: if the code is the same as `runFreeChat`'s, extract
it (e.g. `scrub` into `vendorPost.ts`) rather than copy it.

## 6. Route + guards

- `limits.ts` guard 1: accept `'anthropic' | 'openai'` as known providers.
- Guard 2 daily cap: skipped when the request carries the key for the provider it asks for
  (`visitorKey` for free, `vendorKey` for anthropic/openai). Per-minute stays.
- Guard 3 (one in flight per IP, site cap): applies to free, anthropic and openai
  (they all hold a server-side loop and a browser channel).
- `routes/ai.ts`: `provider === 'free' || isVendor(provider)` share the same glue block
  (abort controller, BrowserChannel, init event, close handling, remember); only the
  runner call differs. Do not copy the block.
- `GET /api/ai/status`: add `vendors: { anthropic: { keyPresent }, openai: { keyPresent } }`
  from the headers (boolean only).

## 7. Key check endpoint (FA-19 server half)

`POST /api/ai/check-key` body `{ vendor: 'openrouter' | 'anthropic' | 'openai' }`, key in the
vendor's header (`x-openrouter-key` for openrouter). Calls the models endpoint with that
key; returns `{ ok: true, models: <count> }` or `{ ok: false, kind, error }` (scrubbed).
Never stores or logs the key. Rate-limited by the per-minute guard (mount it under the
same guards router: add `router.post('/check-key', perMinute)`), not the daily cap.
OpenRouter check: `GET https://openrouter.ai/api/v1/key` if `freeModels.ts` has a helper,
else `/models` with auth.

## 8. Tests (server vitest)

- `anthropicAdapter.test.ts`: buildRequest lifts system; tool mapping; `tool_choice none`
  with tool blocks and no tools round; parseReply text + tool_use + truncated; appendToolTurn
  shape; nudge merges into tool_result user turn; mapError 401 / 400 credit / 429 / 529.
- `openRouterAdapter` existing tests keep passing; add OpenAI factory cases:
  `max_completion_tokens` field, 429 insufficient_quota -> credit.
- `vendors.test.ts`: pickModel cases; OpenAI chat-model filter.
- FA-14 reachability (`aiRoute.test.ts`), one case per vendor: real route, stubbed vendor
  fetch via the test seam, `provider: 'anthropic'` with header `x-anthropic-key: sk-ant-test`;
  assert the stub saw `x-api-key: sk-ant-test` on BOTH the models URL and the messages URL,
  a tool_call round trip through the browser channel, the final text event, and that the
  key string appears in no SSE event. Same for openai (`Authorization: Bearer sk-test`).
  No key: one error event, zero fetches.
- check-key: ok path returns model count; 401 path returns `kind: 'auth'`, key not in body.
- Regression check per test file: fails with the feature reverted (copy file aside, run,
  restore from the copy). Never stash/pop.
