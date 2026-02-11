# DEViLBOX Project Memory

## CRITICAL: Git Safety Rules

**!!! ABSOLUTE RULE - NEVER VIOLATE !!!**

### NEVER overwrite local changes without explicit user approval

Before running ANY of these destructive git commands, you MUST:

1. **STOP and WARN the user** about potential data loss
2. **Show exactly what local changes exist** (`git status`, `git diff --stat`)
3. **Explain the impact** - how many files, lines of code, hours of work at risk
4. **Get EXPLICIT approval** - user must type "yes" or confirm
5. **Suggest saving first** - recommend `git stash` or creating a backup branch

**FORBIDDEN COMMANDS** (without user approval AND saving local changes first):
- `git reset --hard` - DESTROYS all local changes
- `git checkout .` - DESTROYS all local changes
- `git restore .` - DESTROYS all local changes
- `git clean -f` - DELETES untracked files permanently
- `git pull` (when local changes exist) - Can cause merge conflicts or loss
- `git fetch origin && git reset --hard origin/main` - DESTROYS everything

**SAFE ALTERNATIVES:**
- `git stash` - Saves local changes before any destructive operation
- `git stash -u` - Saves local changes INCLUDING untracked files
- `git branch backup-YYYY-MM-DD` - Creates backup branch before reset
- `git diff > backup.patch` - Saves changes as patch file

**WHY THIS MATTERS:**
On 2025-01-29, 20 hours of local development work was permanently lost when
`git reset --hard` was run without saving local changes first. This catastrophic
data loss must NEVER happen again.

**WHEN IN DOUBT: DO NOT RUN THE COMMAND. ASK THE USER FIRST.**

---

## Furnace Synth Implementation

*** IMPORTANT ***

When debugging or implementing Furnace chip synths (GB, NES, OPN2, OPM, etc.):

1. **NEVER guess** - Always reference the actual Furnace source code
2. **Get proof/evidence** - Read the relevant platform file (e.g., `gb.cpp`, `nes.cpp`)
3. **Implement 1:1** - Match the Furnace source exactly, including:
   - Register write sequences
   - Timing/order of writes
   - Envelope formats
   - Frequency calculations
   - Key-on/key-off sequences

Reference code location: `/Users/spot/Code/DEViLBOX/Reference Code/furnace-master/src/engine/platform/`

*** IMPORTANT ***

---

## localStorage Schema Versioning

### The Problem
localStorage auto-persistence can cause stale/buggy data to persist across app updates.
For example, `filterSelect=255` was an invalid value that caused muffled audio - once
saved to localStorage, it kept corrupting the synth on every page load.

### The Solution
Schema versioning in `src/hooks/useProjectPersistence.ts`:

```typescript
const SCHEMA_VERSION = 2;  // Bump this for breaking changes
```

**How it works:**
1. Every save includes `schemaVersion: N`
2. On load, if saved `schemaVersion < SCHEMA_VERSION`, data is discarded
3. User gets a fresh start with correct defaults

**When to bump SCHEMA_VERSION:**
- Fixed a bug in default instrument config values
- Changed the structure of stored data
- Any change that would cause old saved data to misbehave

**Version History:**
- 1: Initial (implicit, no schemaVersion field)
- 2: Fixed `filterSelect=255` bug in TB303 config (2026-02-09)

---

## DB303 Parameter Convention

All DB303Synth/BuzzmachineGenerator parameters are **0-1 normalized** at every layer.
WASM handles Hz/ms conversion internally. **Never transform values before passing to the synth.**

Two canonical entry points:
- **`applyConfig(config: TB303Config)`** — Bulk updates from store (init, UI knob changes, MIDI CC)
- **`set(param: string, value: number)`** — Single param, real-time (automation, tracker)

Both accept 0-1 normalized values (except discrete params like `filterSelect`, `chorusMode`).
The synth owns all internal transformations. No caller ever converts units.

---
