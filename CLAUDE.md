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
