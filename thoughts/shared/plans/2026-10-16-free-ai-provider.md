---
date: 2026-10-16
author: spot (design by agent, not implemented)
status: design
topic: Free AI provider (OpenRouter free models, server side, default for live visitors)
---

# Free AI provider — design

Owner decision (fixed): server-side OpenRouter chat completions, FREE models only, picked
automatically by measured latency (EWMA persisted to a JSON file, failed + mute tracking),
new provider id `free`, the default, so live visitors at https://devilbox.uprough.net get
AI help with no login. Key in `OPENROUTER_API_KEY` on the server.

Source being copied: AmiExpress BBS sysop chat,
`/Users/spot/Code/AmiExpress/amiexpress-web/web/backend/src/handlers/`
(`grumpy-sysop-bot.handler.ts`, `sysop-ai/loop.ts`, `sysop-ai/model-cost-store.ts`).

Finish line: on the live site, a visitor with no login opens the AI panel, the provider is
"Free", asks "what BPM is this song?", and the answer comes from a free OpenRouter model
that called `get_song_info` against THAT visitor's own browser. Proven by the one
reachability test (FA-14) plus the owner's live check (Blocked on owner below).

---

## Findings (evidence)

### Q1. How CLI providers reach the tools today — and why live visitors cannot

Chain (dev machine only):

1. `server/src/routes/ai.ts:28` `MCP_SERVER_PATH = resolve(__dirname, '../mcp/index.ts')`;
   `ai.ts:93` passes `{ command: 'npx', args: ['tsx', MCP_SERVER_PATH] }` to
   `buildInvocation` (`server/src/ai/cliProviders.ts:115-185`), which writes it into each
   CLI's MCP config (`--mcp-config`, `.pi/mcp.json`, opencode inline).
2. The CLI spawns the MCP server over stdio: `server/src/mcp/index.ts:16-40`
   (`StdioServerTransport`, `connectAsClient()`, `createMcpServer()`).
3. Every tool handler is `call(method, params)` -> `callBrowser` (`server/src/mcp/mcpServer.ts:91-93`,
   import at `:13`), which in the subprocess is a WS client to `ws://localhost:4003/mcp`
   (`server/src/mcp/wsRelay.ts` `connectAsClient`, ~line 245-255).
4. Express owns port 4003 (`server/src/index.ts:193` `startMcpRelay()`); the relay forwards
   `/mcp` requests to ONE global `browserSocket` (`wsRelay.ts:33`, `:105-133`); a new browser
   KICKS the old one (`wsRelay.ts:149-157`, "Another DEViLBOX tab took over MCP control").
5. The browser side is `src/bridge/MCPBridge.ts` connecting to `RELAY_WS_URL =
   ws://localhost:4003` (`src/bridge/relayEndpoint.ts:14-15`); it dispatches `handlers[method]`
   (`MCPBridge.ts:233`, `:623-650`).

On live this chain does not exist:

- `src/bridge/relayEndpoint.ts:4-5` says it outright: "runs on the developer's machine next to
  Vite; nothing serves it on the live host". A live visitor's browser dials `ws://localhost:4003`
  = the visitor's OWN machine.
- CI deploys static files only: `.github/workflows/deploy.yml:72-78` uploads `dist/`, `:159-160`
  tars it, `:194-200` fires the webhook; `scripts/server-setup.sh` `/opt/devilbox-deploy.sh`
  rsyncs that tarball to `/var/www/devilbox-dist` (setup lines ~55-77). No backend step.
- The live API is a separate Docker backend (`docker-compose.yml` `backend`, `Dockerfile.backend`,
  `CMD node dist/index.js`, port 3001 internal, no 4003 published). It is NOT redeployed by CI.
  Probed 2026-10-16: `GET https://devilbox.uprough.net/api/health` -> ok;
  `GET /api/ai/status` -> `{"available":false,"error":"No AI CLI found. Install Claude CLI or GitHub Copilot CLI."}`
  — that is the PRE-05f5faadf message, so the live backend runs older server code than `main`.
- Even if 4003 were exposed, the relay has one global browser slot (`wsRelay.ts:33`), so two
  visitors would steal each other's tools, and `ai.ts:93` spawns `npx tsx …/index.ts`, which a
  compiled `dist/` container does not have.

Plainly: today a live visitor's tools cannot be reached by any AI provider, and the live backend
does not even have the current `/api/ai` code.

### Q2. How the OpenRouter loop calls the tools

Searched: `callBrowser` (wsRelay.ts:303, 11 direct uses in mcpServer.ts + `call()` helper
mcpServer.ts:91), `createMcpServer` (mcpServer.ts:95), `@modelcontextprotocol/sdk` in
`server/package.json:18` (has `client/index.js` and `inMemory.js` in `server/node_modules`),
browser dispatch `handlers` / `handleMessage` (MCPBridge.ts:233, 623), `relayEndpoint.ts`,
`ControllerWebSocket.ts` (the `/controller` relay leg, same single-slot problem).

Decision (design-level, with the reason):

- **Tool DEFINITIONS and server-side tool logic: be an in-process MCP client of the SAME
  `createMcpServer()`**, linked by `InMemoryTransport.createLinkedPair()` + SDK `Client`.
  `client.listTools()` gives JSON-schema'd tools (zod already converted by the SDK) and
  `client.callTool()` runs the real handler, including server-side work some tools do
  (`load_modland` download, `search_hvsc`). No second tool table, no subprocess, no tsx.
- **Tool EXECUTION in the visitor's browser: per-chat channel over the SSE stream, not the WS
  relay.** `createMcpServer` gets an injected `callBrowser` (default = the relay's, so the CLI
  path is unchanged). For a Free chat it is a channel bound to that conversation: the server
  writes `{type:'tool_call', callId, method, params}` on the chat's SSE response; the browser runs
  the SAME dispatch MCPBridge uses and POSTs `{conversationId, callId, result|error}` to
  `/api/ai/tool-result`. Why not the relay: it needs a public `wss://` endpoint plus nginx upgrade
  config plus per-visitor routing in a single-slot relay; the SSE response already IS a
  per-visitor, same-origin, HTTPS channel, and it dies with the chat (abuse surface = the chat).
- Not chosen: spawning `mcp/index.ts` per request as a stdio MCP client (needs tsx in prod,
  ~seconds per spawn, and still lands on the global relay slot).

### Q3. What to copy from the BBS

| BBS piece | Evidence | Lands in |
|---|---|---|
| `isFreeModel` (prompt AND completion price 0), `supportsTools`, `rankFreeModels` sort: tools > not-mute > EWMA cost > SMALLER context; drop ids containing `think` | handler.ts:443-481 | `server/src/ai/freeModels.ts` |
| Discovery from `GET https://openrouter.ai/api/v1/models`, 1 h cache, `FALLBACK_FREE_MODELS` list, `primeModelCatalogue` test seam | handler.ts:483-531, `getFreeModel` :1372 | `server/src/ai/freeModels.ts` |
| `adminModelIfFree` -> client-requested model honoured only if listed free, else picker | handler.ts:508-513 | `freeModels.ts` (`requestedModelIfFree`) |
| EWMA cost `prev*0.6 + ms*0.4`, `UNTRIED_MS 6000`, failure penalty `+60000` for `PENALTY_MS 10 min`, `noteModelMute` / `modelIsMute` (mute survives, failure does not) | handler.ts:296-340 | `server/src/ai/modelCosts.ts` |
| JSON cost file, load once, debounced 2 s unref'd flush, tmp+rename, every error = cache miss, path call INSIDE the try | model-cost-store.ts:36-110 | `server/src/ai/modelCostStore.ts`; file `${DB_DIR}/ai-model-costs.json` (`server/src/db/database.ts:9`, Docker volume `/data/db`) |
| Background probe of one unmeasured model (5-token prompt, 8 s timeout, records cost + mute) off the visitor's path | handler.ts:342-410 | `freeModels.ts` `probeAnUnmeasuredModel` |
| Tool loop: `MAX_ROUNDS 3`, per-round cap 12 s inside a whole deadline, last round tools removed, `toolCallsWrittenAsText` (models that write calls as text), `withoutControlTokens`, `composeFromWhatTheToolsSaid`, `finish_reason==='length'` -> truncated | loop.ts:15-240 | `server/src/ai/toolLoop.ts` (port; `post` stays an injected seam) |
| Per-message model fallback bounded by TIME: max 8 models, `MIN_ATTEMPT_MS 1200`, failure recorded before moving on | handler.ts:1400-1420, 1555-1585 | `server/src/ai/freeProvider.ts` |
| Status handling: 401 = key refused, stop at once; 429 = rotate to next model; 400/500 with tools -> plain completion retry, 400 remembered as `plainOnly`; 402 (credit/limit) = stop and report "free quota exhausted" (BBS has no explicit 402 branch; it falls through to rotate — DEViLBOX treats 402 like 401 because every free model shares the account limit) | handler.ts:1306-1340, 1547 | `freeProvider.ts` |
| Tool-count limit: BBS sends 15 tools; DEViLBOX registers ~163. Free models fail or slow on big tool lists (Copilot GPT path already skips MCP over 128: cliProviders.ts:147) | handler.ts:466-467 | `server/src/ai/freeToolset.ts` allowlist, hard cap 24 |

Not copied: personas, board card, Groq/Gemini/Cerebras/Zen cascade (owner fixed OpenRouter-only),
rule-based fallback text.

### Q4. Abuse limits — what exists

- `express-rate-limit` is a dependency (`server/package.json:26`) and used ONLY for
  `/api/auth/` (`server/src/index.ts:56-63`, 10 per 15 min). `/api/ai` has no limit
  (`index.ts:74`). Body limit is global 10 MB (`index.ts:54`).
- No `trust proxy` setting (grep: none in index.ts) — behind nginx every request has the proxy's
  IP, so a per-IP limiter without it limits everybody as one client.
- `/api/ai/chat` today spawns a local CLI with no auth; on a public box that is a remote
  CLI-spawn endpoint. `/api/ai/status` reports CLI paths.

---

## Checklist (19 of 19 done: FA-1..FA-10 and FA-14 in 2e0ad1856, FA-11..FA-13 in e121d733e, FA-15 in 3b9f5e407 + 07e438bbe + 465c28e07 with owner server steps open, FA-16 in ccff98d25 + a4df5d8d3, FA-17/18 in 52e02d643 + a4df5d8d3, FA-19 in a4df5d8d3. Owner live check open)

Each item: files / constraint / test.

- [x] **FA-1 Cost store.** Port `model-cost-store.ts` as `server/src/ai/modelCostStore.ts`
  (path from `DB_DIR` like `database.ts:9`, file `ai-model-costs.json`).
  Constraint: never throws to a caller; tmp+rename; path resolution inside the try.
  Test: `server/src/ai/modelCostStore.test.ts` — round trip in a temp dir; garbage file -> empty map;
  unwritable dir -> no throw.

- [x] **FA-2 Cost model.** `server/src/ai/modelCosts.ts`: `noteModelCost`, `noteModelMute`,
  `modelIsMute`, `modelCostMs`, debounced flush through FA-1, constants copied verbatim
  (`0.6/0.4`, `6000`, `+60000` for 10 min).
  Constraint: mute sticks across failures, failure decays; one module owns the Map.
  Test: `modelCosts.test.ts` — EWMA arithmetic, penalty expires at 10 min (injected `now`).

- [x] **FA-3 Free model catalogue + ranking.** `server/src/ai/freeModels.ts`: `isFreeModel`,
  `supportsTools`, `rankFreeModels`, discovery with 1 h cache + fallback list,
  `requestedModelIfFree`, `primeModelCatalogue` seam, `probeAnUnmeasuredModel`.
  Constraint: FREE ONLY — an id not listed at zero price is never sent; `think` models dropped.
  Test: `freeModels.test.ts` — paid model filtered; mute sinks below slow; untried ties go to
  smaller context; requested paid id refused.

- [x] **FA-4 Tool loop port.** `server/src/ai/toolLoop.ts` from `sysop-ai/loop.ts` with tools as
  OpenAI function definitions and an `execute(name,args)` seam instead of `SysopTool`.
  Constraint: `MAX_ROUNDS = 3`, per-round <= 12 s, whole deadline (default 45 s), final round
  without tools, text-dialect tool calls parsed.
  Test: `toolLoop.test.ts` — stubbed `post`: one native tool round then text; text-dialect call
  executed; deadline stops a 4th round.

- [x] **FA-5 Injectable browser call in createMcpServer.** `server/src/mcp/mcpServer.ts:91-95`:
  `createMcpServer({ callBrowser = relayCallBrowser } = {})`, `call()` and the 11 direct
  `callBrowser(` uses read the injected one.
  Constraint: CLI path (`server/src/mcp/index.ts`) unchanged in behaviour; one tool table.
  Test: existing MCP tests stay green; new unit: injected stub receives `get_song_info`.

- [x] **FA-6 Free toolset.** `server/src/ai/freeToolset.ts`: in-process `Client` +
  `InMemoryTransport.createLinkedPair()` over `createMcpServer({callBrowser: channel})`;
  `listTools()` filtered by an explicit ALLOWLIST (read state, edit pattern cells, transport,
  instrument params, `search_modland`/`load_modland`/`search_hvsc`/`load_hvsc`, `get_mcp_help`),
  converted to OpenAI `tools` format; cap 24.
  Constraint: DENY anything touching the server's disk or the visitor's machine beyond the app:
  `load_file` (reads server paths, mcpServer.ts:1568-1607), `evaluate_script`, `hard_reload`,
  `run_*` test/regression tools, `export_*` (base64 blobs blow the context), profiling/monitoring.
  Allowlist, not denylist, so a new tool is off until named.
  Test: `freeToolset.test.ts` — every allowlisted name exists in `listTools()` (counted from the
  server, not grep); `load_file` and `evaluate_script` absent; count <= 24.

- [x] **FA-7 Per-chat browser channel (server).** `server/src/ai/browserChannel.ts`: `call(method,
  params)` writes `tool_call` on the chat's SSE `res` and awaits `/api/ai/tool-result` by `callId`;
  per-call timeout 30 s; closed `res` rejects all pending.
  Constraint: keyed by conversationId + callId (random UUID), result accepted only for a pending
  callId of that conversation; result body capped (64 KB) before it reaches the model.
  Test: `browserChannel.test.ts` — resolve, timeout, unknown callId rejected, close rejects.

- [x] **FA-8 Free provider orchestration.** `server/src/ai/freeProvider.ts`: key check first (no
  key -> one SSE error "Free AI is not configured on this server", no discovery round trip),
  pick model, run FA-4 with FA-6/FA-7, model fallback per Q3 table (time-bounded, max 8, 401/402
  stop, 429 rotate, 400/500 plain retry), record cost + mute after every attempt, kick
  `probeAnUnmeasuredModel` fire-and-forget. Emits the SAME SSE event shapes the CLI path emits
  (`init`, `text`, `error`, `done`) plus `tool_call` and a `model` info event.
  Constraint: `fetch` injected (test seam), `HTTP-Referer: https://devilbox.uprough.net`,
  `X-Title: DEViLBOX`, `max_tokens` 600.
  Test: covered by FA-14 (wiring) + `freeProvider.test.ts` for 429 rotate / 402 stop / mute note.

- [x] **FA-9 Route glue.** `server/src/routes/ai.ts`: `provider === 'free'` branches to FA-8 before
  `findCli` (`ai.ts:80-86`); default provider becomes `'free'` (`ai.ts:53`, `:80`); history reuse
  (`ai.ts:69-76`) feeds `messages` instead of the flattened prompt; `POST /tool-result`;
  `/stop` aborts the Free loop (AbortController in `activeProcesses`' sibling map); `/status`
  reports `free: { available: !!OPENROUTER_API_KEY }`.
  Constraint: route stays glue; all logic in `server/src/ai/`.
  Test: FA-14.

- [x] **FA-10 Public-endpoint limits.** `server/src/index.ts`: `app.set('trust proxy', 1)`
  (nginx in front) and an `express-rate-limit` limiter on `/api/ai/chat` (e.g. 10 per minute and
  100 per day per IP); `express.json({limit:'64kb'})` on `/api/ai`; prompt <= 4000 chars;
  one in-flight Free chat per IP; global concurrency cap (e.g. 8) so the shared OpenRouter free
  quota is not drained by one host. CLI providers (`claude/copilot/pi/opencode`) refused unless
  `AI_CLI_PROVIDERS=1` (dev `.env`) — on a public box they are an unauthenticated CLI spawn.
  Constraint: reuse `express-rate-limit` (already a dependency, index.ts:15); limits as named
  constants in `server/src/ai/limits.ts`.
  Test: `aiLimits.test.ts` — 11th chat in a minute gets 429 SSE error; CLI provider refused with
  env unset.

- [x] **FA-11 Shared browser dispatch.** `src/bridge/MCPBridge.ts:623-650`: extract
  `dispatchBridgeCall(method, params)` (handler lookup + `annotateBlockingDialog`) and use it from
  `handleMessage`; export it.
  Constraint: one dispatch for WS relay and Free tool calls; no second handler table.
  Test: existing MCPBridge tests green; unit: unknown method -> error result.

- [x] **FA-12 Client provider + tool round trip.** `src/stores/useAIStore.ts:22-48`: add
  `{ id: 'free', label: 'Free' }` FIRST and one model row `{ id: 'auto', label: 'Automatic',
  description: 'Fastest free model' }`; initial `provider: 'free'`. `src/services/aiChatService.ts`
  (`:63` chat fetch): on `tool_call` event call `dispatchBridgeCall` and POST the result to
  `${API_BASE}/ai/tool-result`; show `model` event as the panel's model label.
  Constraint: persisted state is only `isOpen` (useAIStore.ts:3-4) so no schema bump; if provider
  ever gets persisted, bump the versioned key.
  Test: `aiChatService.test.ts` — SSE with a `tool_call` -> dispatch called once -> POST body has
  the callId.

- [x] **FA-13 AIPanel copy.** `src/components/ai/AIPanel.tsx`: Free selected shows "Free models
  via OpenRouter — answers may be slower"; status unavailable shows the server's message.
  Constraint: design-system `Button`, token classes only, full English labels.
  Test: component test renders the hint when provider is `free`.

- [x] **FA-14 THE reachability test.** `server/src/ai/aiRoute.test.ts` new case, real
  `aiRoutes` mounted in express (same harness as `:72-104`):
  stub `fetch` serving `/models` with one PAID tool model, one free model WITHOUT tools, one free
  tool model `test/fast:free`; chat completions call #1 returns `tool_calls:[get_song_info]`,
  call #2 returns text "BPM is 125". The test plays the browser: reads the `tool_call` SSE event,
  POSTs `/api/ai/tool-result` with `{bpm:125}`.
  Asserts: completions fetch called exactly twice, both with `model:'test/fast:free'` (picked:
  free + tools, paid never sent); request #1 carries `tools` and <= 24 of them; request #2 carries
  the `role:'tool'` message with `125`; SSE stream has `init`, one `tool_call` for
  `get_song_info`, text containing "125", `done`; cost file in the temp `DB_DIR` now has an
  `ewmaMs` for `test/fast:free` (sentinel that FA-1/2 ran).
  Constraint: one test for wiring; everything else tested where it lives (FA-1..13).

- [x] **FA-15 Live backend deploy path.** The live backend is a hand-run Docker container not
  touched by CI (Findings Q1). Add a backend deploy to the pipeline: `Dockerfile.backend` must
  also COPY `src/lib/import/companionResolver.ts` and whatever it imports (mcpServer.ts:14 imports
  `../../../src/lib/...`; the image copies only `server/src`, Dockerfile.backend:16 — unverified
  whether the image still builds), `docker-compose.yml` backend gets `OPENROUTER_API_KEY=${OPENROUTER_API_KEY}`,
  and `/opt/devilbox-deploy.sh` (scripts/server-setup.sh) rebuilds/restarts the backend on
  deploy. Nginx must pass SSE unbuffered (route already sends `X-Accel-Buffering: no`, ai.ts:64)
  and allow a ~60 s read timeout on `/api/ai/chat`.
  Test: CI step `docker build -f Dockerfile.backend .` succeeds; live check by owner.
  Done (repo side): 3b9f5e407 (image builds from the repo layout, compose passes the key),
  07e438bbe (CI job backend-image ships devilbox-backend.tar.gz in the release; the deploy script
  loads it and runs `docker compose up -d --no-build backend` in BACKEND_COMPOSE_DIR, default
  /var/www/devilbox). nginx needs no SSE change (route sends X-Accel-Buffering: no); its default
  60 s proxy_read_timeout is idle time between chunks, not total.
  465c28e07: live chain is Caddy -> nginx -> backend (verified from response headers `via: 1.1
  Caddy`, `server: nginx`); trust proxy was 1, so all visitors shared one daily cap. Now
  TRUST_PROXY_HOPS, compose sets 2.
  Owner steps open: re-run scripts/server-setup.sh so /opt/devilbox-deploy.sh has the backend
  step; BACKEND_COMPOSE_DIR must hold docker-compose.yml and a .env with JWT_SECRET and
  OPENROUTER_API_KEY.
- [x] **FA-16 Visitor key fields.** Three masked fields (OpenRouter, Anthropic, OpenAI) in
  `AIKeysPanel`, stored only in this browser (`useAIKeysStore`); `keyHeadersFor` sends only the
  chosen provider's own header. Done: ccff98d25 (OpenRouter), a4df5d8d3 (all three).
- [x] **FA-17 Anthropic adapter.** Server: 52e02d643 (`anthropicAdapter`, `vendorChat`, check-key).
  Client provider "Claude (Your Anthropic Key)": a4df5d8d3.
- [x] **FA-18 OpenAI adapter.** Server: 52e02d643. Client provider "OpenAI (Your Key)": a4df5d8d3.
- [x] **FA-19 AI setup wizard.** `AISetupWizard` (choose, paste key, check, finish), opens once by
  itself (`devilbox-ai-wizard` v1), reopened by "Set Up AI Help" in the keys panel and the
  Settings AI tab. Key saved only after `/api/ai/check-key` accepts it. Reachability:
  `AISetupWizard.reachability.test.tsx`. Done: a4df5d8d3. Unverified by a human: layout and
  stacking over the Settings modal.

---

## Open questions for the owner

1. **Key provisioning on Hetzner**: create the OpenRouter key and put `OPENROUTER_API_KEY` in the
   backend container's environment (the `.env` next to `docker-compose.yml` on the server). Is a
   free-tier key enough (OpenRouter free models have a small daily request cap per key, lifted
   by a one-off credit purchase) or will you add credit so the daily cap is higher? Free models
   stay free either way; only the cap changes.
2. **Backend auto-deploy (FA-15)**: may CI/the webhook rebuild and restart the backend container,
   or do you deploy the backend by hand? The live backend is currently older than `main`.
3. **Daily limits (FA-10)**: 10/minute and 100/day per IP, 8 concurrent site-wide — accept, or
   other numbers?

## Owner decisions (2026-10-16)

- Backend deploy: CI rebuilds and restarts the backend container on push (FA-15), after confirming the image builds.
- Key budget: the owner adds credit to the OpenRouter key to raise the free-model daily cap; requests still go to free models only.
- Limits accepted: 10 per minute and 100 per day per IP, 8 concurrent site-wide, all overridable by environment variables.
- Owner (2026-10-16): "the keys needs to be setable by the users from the devilbox ui". Design (defaults chosen, owner may veto):
  - Settings gets an "OpenRouter API Key" field (also reachable from the AI panel when Free is selected). Stored only in the visitor's browser, in localStorage under a versioned key (devilbox-ai-keys v1), with a Clear button; the field is masked.
  - The browser sends the key with each chat request in a header (X-OpenRouter-Key). The server uses it for that request only: never stored, never logged, never echoed in errors.
  - A visitor key overrides the server's OPENROUTER_API_KEY; without one the server key (owner credit) is used. No key anywhere: the panel says to add one in Settings.
  - Visitor-key requests skip the per-IP daily cap (their own quota pays) but keep the per-minute limit and the site-wide concurrency cap.
  - New item FA-16 (client key field + header) and FA-8/FA-9 accept the per-request key.
- Owner (2026-10-16): "also anthropic and openai keys". Design (defaults chosen, owner may veto):
  - Two more providers, "Anthropic" and "OpenAI", that call the vendors' HTTP APIs directly with the visitor's key (Anthropic Messages API, OpenAI Chat Completions), through the same server tool loop and in-process toolset as Free. They are separate from the Claude and Codex CLI providers.
  - Visitor key required: there is no server fallback key for these two; without a key the provider shows "Add your key in Settings".
  - Model lists come from each vendor's models endpoint called with the visitor key (no hardcoded model IDs to go stale); default model = the vendor's newest general model in that list.
  - Settings shows three masked key fields (OpenRouter, Anthropic, OpenAI), same storage (devilbox-ai-keys v1, browser only) and per-request headers (X-OpenRouter-Key, X-Anthropic-Key, X-OpenAI-Key), never stored or logged on the server.
  - Rate limits as for visitor-key OpenRouter requests: per-minute and concurrency caps apply, no daily cap.
  - New items: FA-17 Anthropic adapter, FA-18 OpenAI adapter (each: message and tool-call format mapping onto the FA-4 loop, models endpoint, error mapping for 401/429/insufficient credit, one reachability case in FA-14 proving the visitor key reached the stubbed vendor URL); FA-16 grows to three key fields.
- Owner (2026-10-16): "we need wizards to help the users maybe?". Design (default chosen, owner may veto): FA-19 AI setup wizard, one Modal with steps, opened automatically the first time the AI panel expands with no key set and no working Free fallback, and on demand from Settings and the panel ("Set Up AI Help").
  - Step 1, choose: "Free models (no key)" when the server has a key, "Own OpenRouter key (free models, your own quota)", "Anthropic key", "OpenAI key".
  - Step 2, get the key: short plain instructions and a link to the vendor's key page; a masked paste field.
  - Step 3, check: the wizard calls the vendor's models endpoint through the server with the pasted key and shows success with the model count, or the vendor's error in plain words (invalid key, no credit, rate limit). Nothing is saved until the check passes.
  - Step 4, done: the key is saved (devilbox-ai-keys v1), the provider and its default model are selected, and the prompt gets focus with a suggested first question.
  - Stored state devilbox-ai-wizard v1: whether the wizard was completed or dismissed, so it opens on its own only once.
  - Test: the one reachability test for the wizard drives AIPanel expand with no key, walks the steps with a stubbed models endpoint, and asserts the key is stored and the provider selected.

## Server implementation notes (2026-10-16)

- Done server side: FA-1..FA-10 and FA-14, commit 2e0ad1856. Client items (FA-11..13, FA-15, FA-16) and FA-17/18 open.
- JSON body limit is 256kb, not 64kb: the envelope around a 64 KB tool result must fit.
- `DB_DIR` one-liner duplicated in modelCostStore.ts; importing `database.ts` would open the SQLite file.
- Fallback catalogue entries are assumed to support tools.
- In FA-14 the probe may hit the other free model; the test tolerates it.
- `/api/ai/chat` was an unauthenticated CLI spawn before; CLI providers now refused unless `AI_CLI_PROVIDERS=1`; unknown providers return 400.
- `toolLoop.ts` is vendor-neutral behind `LoopAdapter`; OpenRouter lives in `openRouterAdapter.ts`; `freeToolset` yields neutral `ToolSpec` (plan said OpenAI format).
- express-rate-limit 7.5.1; cast `as unknown as RequestHandler` at the boundary (two @types/express copies).
- Visitor key (`X-OpenRouter-Key`): used for that request only, never stored/logged/echoed; skips the per-IP daily cap, keeps per-minute and concurrency limits; the model probe uses the server key only, and only for server-key requests. No key anywhere: "add a key in Settings".
- Pre-commit hook timed out on unrelated root suites (mameChipWiring, fileNameSearchFindsAnySong) under machine load ~40.
