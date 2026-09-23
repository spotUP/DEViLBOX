---
date: 2026-09-23
topic: The 222 invalid Tailwind classes, and what each becomes
tags: [design-system, tailwind, tokens]
status: final
---

# Invalid class names, and what each one becomes

These classes exist in **no** theme and **no** CSS file. Verified: absent from
`tailwind.config.js`, `src/index.css`, `src/App.css`, `DeckCssTurntable.css`,
and the config has `plugins: []`. They produce **no CSS at all**, so every one
of them renders unstyled today. `drumpad/preset-browser/PresetCard.tsx:16,17`
is the clearest case — those badges have three dead classes each and render
with no styling whatever.

This is a defect list, not a style list. Fixing one repairs a visible bug.

## The mapping — apply exactly this, do not improvise

| Invalid | n | Becomes | Why |
|---|---:|---|---|
| `bg-dark-bgPrimary` | 37 | `bg-dark-bg` | "primary surface" is `dark.bg` |
| `border-border-primary` | 36 | `border-dark-border` | named in CLAUDE.md as a known mistake |
| `bg-dark-surface` | 28 | `bg-dark-bgSecondary` | a raised surface is `bgSecondary` |
| `text-text-tertiary` | 26 | `text-text-muted` | the theme has no third text level |
| `bg-surface-secondary` | 23 | `bg-dark-bgSecondary` | same surface, invented family |
| `text-dark-text-secondary` | 13 | `text-text-secondary` | text lives under `text-`, not `dark-` |
| `text-accent-info` | 7 | `text-accent-highlight` | no `accent.info`; highlight is the informational accent |
| `bg-accent-info` | 6 | `bg-accent-highlight` | as above, opacity suffix preserved |
| `border-accent-info` | 5 | `border-accent-highlight` | as above |
| `bg-bg-tertiary` | 7 | `bg-dark-bgTertiary` | same family CLAUDE.md warns about |
| `bg-accent-primaryHover` | 7 | `hover:bg-accent-primary` | a state, not a colour — read the context and put it in the right variant |
| `border-dark-borderHover` | 6 | `hover:border-dark-borderLight` | as above |
| `text-text-subtle` | 3 | `text-text-muted` | |
| `bg-dark-hover` | 3 | `bg-dark-bgHover` | |
| `bg-accent-hover` | 3 | `bg-dark-bgHover` | it is a hover SURFACE, not an accent |
| `bg-surface-primary` | 2 | `bg-dark-bg` | |
| `bg-dark-bgQuaternary` | 2 | `bg-dark-bgTertiary` | no fourth level exists |
| `text-primary` (bare) | 2 | `text-text-primary` | |
| `text-secondary` (bare) | 1 | `text-text-secondary` | |
| `text-muted` (bare) | 1 | `text-text-muted` | |
| `text-error` (bare) | 1 | `text-accent-error` | |
| `bg-error` (bare) | 1 | `bg-accent-error` | |
| `bg-bg-secondary` | 1 | `bg-dark-bgSecondary` | named in CLAUDE.md |
| `bg-surface-raised` | 1 | `bg-dark-bgTertiary` | |
| `to-dark-bgDeep` | 1 | `to-dark-bg` | |
| `text-dark-textSecondary` | 1 | `text-text-secondary` | |
| `text-dark-text` | 1 | `text-text-primary` | |
| `scrollbar-thumb-dark-border` | 1 | **delete the class** | needs a scrollbar plugin; `plugins: []` |

## Rules

- **Opacity suffixes survive.** `bg-dark-bgPrimary/50` becomes
  `bg-dark-bg/50`. There are `/30`, `/50`, `/95` in the wild.
- **The two `*Hover` names are STATES.** Do not emit `hover:` blindly — read
  the line. If the class already sits inside a `hover:` variant or a
  conditional "is hovered" branch, it just becomes the base colour.
- Do not fix anything else while in there. No token migration, no component
  swaps. One defect class at a time keeps the diff reviewable.
