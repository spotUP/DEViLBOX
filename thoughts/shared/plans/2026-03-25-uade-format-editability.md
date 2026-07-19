---
date: 2026-03-25
topic: uade-format-editability
tags: [formats, uade, editing, encoding, amiga]
status: in-progress
---

# UADE Format Full Editability — Master Plan

## Goal

Make every UADE Amiga format fully editable and exportable to its original binary format.
Editing = pattern layout (read/write pattern cells via UADE chip RAM).
Exporting = encoder (write modified data back to original Amiga binary format).

## Current State (2026-03-25)

- **91 formats** have pattern layouts (editable)
- **87 formats** have encoders (exportable)
- **4 formats** have encoders but no layout: OctaMED (uses MED layout), StartrekkerAM (uses WASM), DSMDyn, DSS

## Formats Needing Work

### Priority 1: Compiled 68k with ASM source available

**IMPORTANT FINDING:** These compiled 68k formats embed replayer + data in a single executable.
Pattern data offsets vary PER FILE — there's no universal layout. `uadePatternLayout` CANNOT work
for these because offsets are runtime-determined, not format-fixed.

**Correct approach:** For compiled 68k formats, the WASM transpiler route IS needed. Each module
has its OWN embedded play routine — there's no universal pattern layout. The EaglePlayer wrapper
just calls `JSR (PlayPtr)` to run the module's code. Pattern data addresses are runtime-determined.

**Two viable paths:**
1. Build standalone WASM from transpiled C, add Paula write interception to capture notes as
   played, then import captured patterns back into the tracker. This gives read-only editing.
2. Full RE of each module's play routine to find the sequence/pattern pointer chain, then build
   a `uadeVariableLayout` scanner. This gives read-write editing but is extremely labor-intensive.

**Confirmed via code analysis (2026-03-25):** Dave Lowe's transpiled C code at
`davelowe-wasm/src/DaveLowe/DaveLowe.c` (3176 lines) shows the Interrupt() function simply
calls `JSR (PlayPtr)` — the module's own compiled play routine. No static pattern layout possible.

These have UADE ASM source at `third-party/uade-3.05/amigasrc/players/wanted_team/`.

| Format | ASM Source | Parser | Encoder | Layout | Status |
|---|---|---|---|---|---|
| Dave Lowe | `DaveLowe/` | Yes | Yes | **NO** | Need RE |
| Dave Lowe New | `DaveLoweNew/` (via `dz/`) | Yes | No | **NO** | Need RE + encoder |
| Ben Daglish | `BenDaglish/` | Yes | No | **NO** | Need RE |
| Ben Daglish SID | `BenDaglishSID/` | Yes | No | **NO** | Need RE |
| Fred Gray | `FredGray/` | Yes | No | **NO** | Need RE |
| Jason Brooke | `JasonBrooke/` | Yes | No | **NO** | Need RE |
| Jason Page | `JasonPage/` | Yes | No | **NO** | Need RE |
| Mark Cooksey | `MarkCooksey/` | Yes | No | **NO** | Need RE |
| David Hanney | `DavidHanney/` | Yes | No | **NO** | Need RE |
| Paul Shields | `PaulShields/` | Yes | No | **NO** | Need RE |
| Paul Summers | `PaulSummers/` | Yes | No | **NO** | Need RE |
| Steve Barrett | `SteveBarrett/` | Yes | No | **NO** | Need RE |
| Thomas Hermann | `ThomasHermann/` | Yes | No | **NO** | Need RE |
| Wally Beben | `WallyBeben/` | Yes | No | **NO** | Need RE |
| Kim Christensen | `KimChristensen/` | Yes | No | **NO** | Need RE |
| Jeroen Tel | `JeroenTel/` | Yes | No | **NO** | Need RE |

### Priority 2: Packer formats (pattern data is packed/compressed)

These wrap standard MOD/tracker data in a custom container. Pattern data exists but is packed.
The parser already unpacks it — just need to add layout + encoder.

| Format | Parser | Layout | Encoder | Notes |
|---|---|---|---|---|
| Magnetic Fields Packer | Yes | No | No | Packs ProTracker MOD |
| Novo Trade Packer | Yes | No | No | Packs MOD |
| Nick Pelling Packer | Yes | No | No | Packs MOD |
| Blade Packer | Yes | No | No | Packs MOD |
| Alcatraz Packer | Yes | No | No | Packs MOD |
| Mosh Packer | Yes | No | No | Packs MOD |
| Titanics Packer | Yes | No | No | Packs MOD |
| Peter Verswyvelen Packer | Yes | No | No | Packs MOD |

These are lower priority — they just pack standard MOD data. Editing the unpacked MOD and re-packing is possible but the packer format is rarely needed for export.

### Priority 3: Other structured formats

| Format | Parser | Layout | Encoder | Notes |
|---|---|---|---|---|
| Chip Tracker | Yes | No | No | Simple tracker format |
| Fashion Tracker | Yes | No | No | Structured |
| FM Tracker | Yes | No | No | FM synthesis tracker |
| Music Maker | Yes | No | No | Structured |
| Quartet | Yes | No | No | 4-voice PCM |
| Sound Master | Yes | No | No | Simple tracker |
| Sound Player | Yes | No | No | Simple |
| Time Tracker | Yes | No | No | Structured |
| Tomy Tracker | Yes | No | No | Simple |

## Approach for Each Format

### Step 1: Read the ASM source
Location: `third-party/uade-3.05/amigasrc/players/wanted_team/<FormatName>/src/`
Find: pattern data structure (how notes, instruments, effects are stored in memory)
Key things to identify:
- Base address of pattern data
- Bytes per row per channel
- Byte layout: note, instrument, effect type, effect value
- Number of channels
- Pattern length

### Step 2: Add uadePatternLayout to parser
In `src/lib/import/formats/<Format>Parser.ts`:
```typescript
song.uadePatternLayout = {
  type: 'fixed',
  baseAddress: 0xNNNN,  // from ASM analysis
  bytesPerRow: N,
  bytesPerChannel: N,
  channelCount: N,
  patternLength: N,
  noteOffset: 0,
  instrumentOffset: N,
  effectTypeOffset: N,
  effectValueOffset: N,
};
```

### Step 3: Create encoder
In `src/engine/uade/encoders/<Format>Encoder.ts`:
Follow the pattern from existing encoders (e.g., `DavidWhittakerEncoder.ts`).
The encoder writes TrackerCell data back to the UADE chip RAM binary format.

### Step 4: Verify
Load a file of that format → edit a pattern cell → export → reload → verify the edit persisted.

## Session Plan

Work through Priority 1 formats one at a time. Each format takes ~30-60 minutes:
1. Read ASM source (10 min)
2. Identify pattern data structure (10 min)
3. Add layout to parser (10 min)
4. Create encoder (10 min)
5. Verify (10 min)

Start with **Dave Lowe** (already has encoder, just needs layout).
Then **Dave Lowe New**, **Ben Daglish**, **Fred Gray**, etc.
