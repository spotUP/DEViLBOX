# DEViLBOX Project Memory

**Global rules:** `~/.claude/CLAUDE.md` defines house defaults (precedence, root-cause fixes, no cheap alternatives, regression tests, git safety, no emojis, single source of truth, `thoughts/` directory, dual handoff formats, MCP-preferred debugging, full English UI labels, `## Commands` section). This file overrides the global where they conflict — DEViLBOX upgrades several rules to *hard* requirements (MCP-first for debugging, DOM-only rendering, strict Tailwind class allowlist, knob/control `useRef` pattern, build verification command).

## Commands

| Action | Command |
|--------|---------|
| Start dev (Express :3011 + Vite :5174 + WS relay :4003) | `npm run dev` |
| Stop dev | Ctrl-C in the terminal running `npm run dev` |
| Type-check (strict) | `npm run type-check` (`tsc -b --force` — catches more than `tsc --noEmit`) |
| Lint | `npm run lint` |
| Test (interactive watch) | `npm run test` |
| Test (CI mode, headless) | `npm run test:ci` |
| Build production | `npm run build` |
| Deploy | `git push origin main` (CI builds + Hetzner pulls automatically — never `gh-pages`) |
| Format status tracker | `npx tsx tools/format-server.ts &` (serves on :4444) |

**Type-check is mandatory after every change.** `npm run type-check` must pass before marking a task complete — it catches unused vars (TS6133), strict null/undefined, enum syntax issues that `tsc --noEmit` misses. This is a stricter local rule than the global "run the project's type-check"; do not substitute.

## Project-specific overrides

### Debugging — MCP + real Chrome, NEVER Playwright

DEViLBOX upgrades the global "MCP preferred" rule to **MCP required**. Playwright's bundled Chromium lacks WASM SIMD, breaks cross-origin isolation, and can't run ONNX inference or AudioWorklets — false negatives for features that work fine in real Chrome.

Always debug via the DEViLBOX MCP (`get_console_errors`, `play_fur`, `load_file`, `get_audio_level`, `play` / `stop`). Prerequisites:

1. `npm run dev` running.
2. Browser open at `http://localhost:5174`.
3. Click in the browser once to unlock the AudioContext.

If MCP shows "No browser connected" — check `lsof -nP -iTCP:4003 -sTCP:LISTEN` to confirm Express owns port 4003, then reconnect Claude Code. Full troubleshooting: `docs/MCP_DEBUGGING_GUIDE.md`. ~130 tools grouped by category — call `get_mcp_help` for the live catalogue.

### Deployment — Hetzner, NOT GitHub Pages

Hosted at `devilbox.uprough.net`. Deploy is fully automatic on `git push origin main` — CI builds via `.github/workflows/deploy.yml`, creates a GitHub Release with `devilbox-dist.tar.gz`, webhook triggers the Hetzner server to pull and deploy.

**Never** `gh-pages` / `npx gh-pages -d dist` — those publish to the wrong host. If CI fails, fix the underlying code (type errors / missing files / etc.) and push again. Server setup: `scripts/server-setup.sh`.

### UI architecture — DOM only, single source of truth

DEViLBOX renders DOM exclusively (React HTML / canvas — no Pixi / GL).

```
Stores + Hooks (shared data)  →  DOM Components
```

1. **Share stores and hooks.** `useGTUltraStore`, `useGTUltraFormatData`, etc. are the single source of truth. Components consume them.
2. **Never duplicate logic.** Data transforms, cell change handlers, adapter functions live in shared hooks / utils (`useGTUltraFormatData.ts`, `gtuAdapter.ts`). Components handle presentation only.
3. **Design tokens only — never hardcode colors.** DOM components use Tailwind token classes from `tailwind.config.js`, never raw colours like `text-red-400`. Exceptions: intentional decorative palettes (channel colours, hot-cue colours, oscilloscope voice colours).

#### Tailwind token class allowlist (MANDATORY)

These are the **only** valid colour classes. Don't invent class names — if it's not in this list, it doesn't exist. Common mistake: `bg-bg-primary`, `border-border-primary`, `bg-bg-secondary` — these don't exist. The correct prefix is `dark-` for backgrounds/borders, `text-` for text.

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

- Opacity variants: append `/<opacity>` — `bg-accent-primary/10`, `border-accent-primary/50`.
- Focus rings: `focus:ring-accent-primary`; use `focus:ring-1` in compact panels, not `focus:ring-2`.
- Inputs / controls: `bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary font-mono text-xs`.
- Compact panel typography: `text-[10px] font-mono` for labels, `text-[9px] font-mono` for badges. **Never** `text-sm font-semibold` in side panels — that's for full-page layouts.

#### UI component allowlist

Use the design-system components in `src/components/ui/` — never build one-off inline buttons / modals:

| Need | Use | NOT |
|------|-----|-----|
| Clickable action | `<Button variant="primary\|default\|ghost\|danger">` | inline `<button className="px-4 py-2 bg-...">` |
| Dialog / popup | `<Modal>` + `<ModalHeader>` + `<ModalFooter>` | `<div className="fixed inset-0 ...">` |
| Dropdown select | `<CustomSelect>` (`@components/common/CustomSelect`) | `<select className="...">` |
| Continuous value | `<Knob>` (`@components/controls/Knob`) | `<input type="range">` |
| Boolean toggle | `<Toggle>` (`@components/controls/Toggle`) | `<input type="checkbox">` |
| Toast message | `notify.success` / `error` / `warning()` | `alert()` or custom toast div |

### Knob / control handling — `useRef`-based current state

See [`docs/CONTROL_PATTERNS.md`](docs/CONTROL_PATTERNS.md) for the full pattern + reference implementation (`JC303StyledKnobPanel.tsx`).

Summary: **never** capture `config` directly in a `useCallback`; mirror it in a `useRef`, read `configRef.current` in callbacks, list only `onChange` in deps. Avoids the stale-closure bug where rapid knob input causes controls to interfere with each other.

Every knob in the app must use `@components/controls/Knob` and pass the appropriate `paramKey` prop when the value can be driven by MIDI CC — see `docs/CONTROL_PATTERNS.md` for the imperative fast-path, the `parameterRouter` table, and the knob perf invariants (no CSS transitions, no idle drop-shadow, `React.memo`-skip on subscribed values, rAF-batched store writes).

### Build verification — strict mode required

The global rule says "run the project's type-check after every change". DEViLBOX upgrades this: `npm run type-check` (`tsc -b --force`) catches errors `tsc --noEmit` misses (TS6133 unused vars, strict null / undefined, enum syntax under `erasableSyntaxOnly`). Do not mark a task complete until it passes with no errors.

## Synth implementation references

Substantial implementation guides live in `docs/`:

- [`docs/CONTROL_PATTERNS.md`](docs/CONTROL_PATTERNS.md) — knob / fader / control handling, MIDI fast-path, perf invariants.
- [`docs/SYNTH_TB303.md`](docs/SYNTH_TB303.md) — DB303 / TB-303 emulation definitive reference.
- [`docs/SYNTH_FURNACE.md`](docs/SYNTH_FURNACE.md) — Furnace synth integration patterns.
- [`docs/HARDWARE_UI_PATTERN.md`](docs/HARDWARE_UI_PATTERN.md) — hardware UI WASM modules extraction pattern (PT2, FT2, etc.).
- [`docs/FORMAT_COMMAND_STREAM_GRID.md`](docs/FORMAT_COMMAND_STREAM_GRID.md) — the "Rob Hubbard recipe": turn a compiled per-channel command-stream format into an editable tick-grid with byte-exact `blockRows` carriers (davidWhittaker/hippel/benDaglish class).
- [`docs/MCP_DEBUGGING_GUIDE.md`](docs/MCP_DEBUGGING_GUIDE.md) — full MCP tool reference, debugging workflows, architecture.
- [`docs/FORMAT_STATUS_TRACKER.md`](docs/FORMAT_STATUS_TRACKER.md) — `localhost:4444` format-audit dashboard, API, key conventions.

Read these instead of inlining their content here. Update them when implementations change.

## localStorage schema versioning

DEViLBOX persists project state in localStorage under versioned keys. When introducing a breaking schema change, bump the version key + write a migration function. Don't read old keys without one. Migration helper lives in `src/lib/persistence/migrations/`.
