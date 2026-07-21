# DEViLBOX Project Memory

**Global rules:** `~/.claude/CLAUDE.md` set house defaults (precedence, root-cause fix, no cheap alternative, regression tests, git safety, no emoji, single source truth, `thoughts/` dir, dual handoff formats, MCP-preferred debug, full English UI labels, `## Commands` section). This file override global when clash — DEViLBOX bump several rules to *hard* requirement (MCP-first debug, DOM-only render, strict Tailwind class allowlist, knob/control `useRef` pattern, build verify command).

## Commands

| Action | Command |
|--------|---------|
| Start dev (Vite :5174 ONLY — no Express/relay) | `npm run dev` |
| Start dev fullstack (Express :3011 + Vite :5174 + WS relay :4003 — required for MCP) | `npm run dev:fullstack` (or `cd server && npm run dev` next to plain `npm run dev`) |
| Stop dev | Ctrl-C in terminal running dev script |
| Type-check (strict) | `npm run type-check` (`tsc -b --force` — catch more than `tsc --noEmit`) |
| Lint | `npm run lint` |
| Test (interactive watch) | `npm run test` |
| Test (CI mode, headless) | `npm run test:ci` |
| Build production | `npm run build` |
| Deploy | `git push origin main` (CI build + Hetzner pull auto — never `gh-pages`) |
| Format status tracker | `npx tsx tools/format-server.ts &` (serve on :4444) |

**Type-check mandatory after every change.** `npm run type-check` must pass before task done — catch unused vars (TS6133), strict null/undefined, enum syntax `tsc --noEmit` miss. Stricter than global rule; no substitute.

## Project-specific overrides

### Debugging — MCP + real Chrome, NEVER Playwright

DEViLBOX bump global "MCP preferred" to **MCP required**. Playwright bundled Chromium lack WASM SIMD, break cross-origin isolation, can't run ONNX inference or AudioWorklets — false negatives for features work fine in real Chrome.

Always debug via DEViLBOX MCP (`get_console_errors`, `play_fur`, `load_file`, `get_audio_level`, `play` / `stop`). Need first:

1. `npm run dev` running.
2. Browser open at `http://localhost:5174`.
3. Click browser once, unlock AudioContext.

MCP say "No browser connected" — check `lsof -nP -iTCP:4003 -sTCP:LISTEN` confirm Express own port 4003, then reconnect Claude Code. Full troubleshoot: `docs/MCP_DEBUGGING_GUIDE.md`. ~130 tools by category — call `get_mcp_help` for live catalogue.

**Always stop playback when test done.** Playing song keep audio graph, WASM engines, render loop hot — heat + battery drain. After any MCP test start playback (`play`, `play_fur`, `load_file`+play, `trigger_note`), finish with `stop` (plus `release_all_notes` if notes triggered) before task end.

### Deployment — Hetzner, NOT GitHub Pages

Host at `devilbox.uprough.net`. Deploy full auto on `git push origin main` — CI build via `.github/workflows/deploy.yml`, make GitHub Release with `devilbox-dist.tar.gz`, webhook trigger Hetzner server pull + deploy.

**Never** `gh-pages` / `npx gh-pages -d dist` — publish wrong host. CI fail → fix root code (type error / missing file / etc.), push again. Server setup: `scripts/server-setup.sh`.

### UI architecture — DOM only, single source of truth

DEViLBOX render DOM only (React HTML / canvas — no Pixi / GL).

```
Stores + Hooks (shared data)  →  DOM Components
```

1. **Share stores + hooks.** `useGTUltraStore`, `useGTUltraFormatData`, etc. single source truth. Components consume them.
2. **Never duplicate logic.** Data transform, cell change handler, adapter function live in shared hooks / utils (`useGTUltraFormatData.ts`, `gtuAdapter.ts`). Components handle presentation only.
3. **Design tokens only — never hardcode colors.** DOM components use Tailwind token classes from `tailwind.config.js`, never raw colour like `text-red-400`. Exception: intentional decorative palette (channel colour, hot-cue colour, oscilloscope voice colour).

#### Tailwind token class allowlist (MANDATORY)

These the **only** valid colour classes. Don't invent class name — not in list, not exist. Common mistake: `bg-bg-primary`, `border-border-primary`, `bg-bg-secondary` — don't exist. Correct prefix `dark-` for bg/border, `text-` for text.

| Purpose | Background | Text | Border |
|---------|-----------|------|--------|
| Primary surface | `bg-dark-bg` | `text-text-primary` | `border-dark-border` |
| Secondary surface | `bg-dark-bgSecondary` | `text-text-secondary` | `border-dark-borderLight` |
| Tertiary surface | `bg-dark-bgTertiary` | `text-text-muted` | — |
| Hover state | `bg-dark-bgHover` | — | — |
| Active state | `bg-dark-bgActive` | — | — |
| Inverse text | — | `text-text-inverse` | — |
| Primary accent | `bg-accent-primary` | `text-accent-primary` | `border-accent-primary` |
| Secondary accent | `bg-accent-secondary` | `text-accent-secondary` | `border-accent-secondary` |
| Highlight accent | `bg-accent-highlight` | `text-accent-highlight` | `border-accent-highlight` |
| Error / destructive | `bg-accent-error` | `text-accent-error` | `border-accent-error` |
| Success | `bg-accent-success` | `text-accent-success` | `border-accent-success` |
| Warning | `bg-accent-warning` | `text-accent-warning` | `border-accent-warning` |

- Opacity variant: append `/<opacity>` — `bg-accent-primary/10`, `border-accent-primary/50`.
- Focus ring: `focus:ring-accent-primary`; use `focus:ring-1` compact panel, not `focus:ring-2`.
- Inputs / controls: `bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary font-mono text-xs`.
- Compact panel typography: `text-[10px] font-mono` labels, `text-[9px] font-mono` badges. **Never** `text-sm font-semibold` in side panel — that for full-page layout.

#### UI component allowlist

Use design-system components in `src/components/ui/` — never build one-off inline button / modal:

| Need | Use | NOT |
|------|-----|-----|
| Clickable action | `<Button variant="primary\|default\|ghost\|danger">` | inline `<button className="px-4 py-2 bg-...">` |
| Dialog / popup | `<Modal>` + `<ModalHeader>` + `<ModalFooter>` | `<div className="fixed inset-0 ...">` |
| Dropdown select | `<CustomSelect>` (`@components/common/CustomSelect`) | `<select className="...">` |
| Continuous value | `<Knob>` (`@components/controls/Knob`) | `<input type="range">` |
| Boolean toggle | `<Toggle>` (`@components/controls/Toggle`) | `<input type="checkbox">` |
| Toast message | `notify.success` / `error` / `warning()` | `alert()` or custom toast div |

### Knob / control handling — `useRef`-based current state

See [`docs/CONTROL_PATTERNS.md`](docs/CONTROL_PATTERNS.md) full pattern + reference impl (`JC303StyledKnobPanel.tsx`).

Gist: **never** capture `config` direct in `useCallback`; mirror in `useRef`, read `configRef.current` in callback, list only `onChange` in deps. Avoid stale-closure bug where rapid knob input cause controls interfere each other.

Every knob in app must use `@components/controls/Knob` and pass right `paramKey` prop when value can be driven by MIDI CC — see `docs/CONTROL_PATTERNS.md` for imperative fast-path, `parameterRouter` table, knob perf invariant (no CSS transition, no idle drop-shadow, `React.memo`-skip on subscribed value, rAF-batched store write).

### Build verification — strict mode required

Global rule say "run project type-check after every change". DEViLBOX bump this: `npm run type-check` (`tsc -b --force`) catch error `tsc --noEmit` miss (TS6133 unused var, strict null / undefined, enum syntax under `erasableSyntaxOnly`). Don't mark task done till pass no error.

## Synth implementation references

Big impl guide live in `docs/`:

- [`docs/CONTROL_PATTERNS.md`](docs/CONTROL_PATTERNS.md) — knob / fader / control handling, MIDI fast-path, perf invariant.
- [`docs/SYNTH_TB303.md`](docs/SYNTH_TB303.md) — DB303 / TB-303 emulation definitive ref.
- [`docs/SYNTH_FURNACE.md`](docs/SYNTH_FURNACE.md) — Furnace synth integration pattern.
- [`docs/HARDWARE_UI_PATTERN.md`](docs/HARDWARE_UI_PATTERN.md) — hardware UI WASM module extract pattern (PT2, FT2, etc.).
- [`docs/FORMAT_COMMAND_STREAM_GRID.md`](docs/FORMAT_COMMAND_STREAM_GRID.md) — "Rob Hubbard recipe": turn compiled per-channel command-stream format into editable tick-grid with byte-exact `blockRows` carrier (davidWhittaker/hippel/benDaglish class).
- [`docs/MCP_DEBUGGING_GUIDE.md`](docs/MCP_DEBUGGING_GUIDE.md) — full MCP tool ref, debug workflow, architecture.
- [`docs/FORMAT_STATUS_TRACKER.md`](docs/FORMAT_STATUS_TRACKER.md) — `localhost:4444` format-audit dashboard, API, key convention.

Read these 'stead of inline content here. Update when impl change.

## localStorage schema versioning

DEViLBOX persist project state in localStorage under versioned key. Breaking schema change → bump version key + write migration fn. Don't read old key without one. Migration helper live in `src/lib/persistence/migrations/`.