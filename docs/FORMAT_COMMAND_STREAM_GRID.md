# Command-Stream Formats → Editable Tick-Grid (the "Rob Hubbard recipe")

**Audience:** anyone fixing a UADE-native / compiled-68k music format that shows
"missing notes", "I hear it but see nothing", silent channels, or a fake-grid
round-trip below ~30%.

**Reference implementation:** `src/lib/import/formats/RobHubbardParser.ts`
(+ its encoder `robHubbardEncoder`, + regression
`src/lib/import/formats/__tests__/robHubbardRoundtrip.test.ts`).

This is a *class* recipe. Rob Hubbard is the worked example; the same shape
applies to every format whose on-disk data is a **per-channel command byte
stream**, not a rectangular cell grid.

---

## 1. Recognise the format class

A format belongs to this class when ALL of these hold:

- On disk there is **no fixed-width cell grid**. Each channel is an ordered list
  of *blocks*, and each block is a run of **variable-length commands** ending in
  a terminator byte.
- Commands mix **time-advancing** ops (note with a duration, rest with a
  duration) and **zero-time state** ops (change sample, set volume, portamento,
  sustain flag, block-end).
- Channels are **independent**: different block-list lengths, each loops its own
  list at its own rate. There is no shared "row" or "pattern index" across
  channels.
- Real playback is the embedded 68k replayer under UADE. **UADE is the oracle
  ONLY** — the transpile/parser is the single engine for playback + editing.

Symptoms of the WRONG (fake-grid stub) handling:

| Symptom | Root cause under a fake grid |
|---|---|
| round-trip matchPct ~0.20–0.30 | generic `decodeMODCell` reads NON-pattern bytes at fabricated offsets |
| "channel 3/4 missing most notes" | short channel truncated to grid height → goes silent |
| "hear bass, see no notes" | one row per command → a dur-48 note shows 1 row then blank |
| channels drift out of sync | command-indexed rows desync channels that tick at different rates |

RH before this work: `matchPct 0.2188`, fabricated row-major offsets into 68k
player code. That is the stub to kill.

---

## 2. The three-layer separation (the core idea)

The mistake is trying to make ONE representation serve display, editing, AND
byte-exact export. They have conflicting requirements. Split into three:

```
  on-disk command stream            (bytes, the truth)
        │  decodeRHBlock  (1 carrier cell per command; cutoff=len, period=b0, pan=b1)
        ▼
  blockRows[fp]                     (CANONICAL carrier rows — byte-exact source)
        │  encoder.encodePattern(blockRows[fp])  →  reproduces block byte-for-byte
        ▼
  display grid (tick timeline)      (what the user sees + edits; carrier-LESS)
```

**Key invariant:** the display grid cells carry NO byte-exact info. The carriers
live on `layout.blockRows[fp]` and are read only by the encoder / round-trip
test — never by the runtime editor. Consequence: **you can enhance or edit the
display grid freely without touching byte-exactness.** The note-off release
markers (§5) exploit exactly this.

Why carriers can't live in the display cells: a channel's block straddles
pattern boundaries on the shared tick timeline (a dur-48 note spans most of a
64-row pattern; a block spans several patterns). There is no single pattern row
that owns a block, so the carriers must live off-grid, keyed by file-pattern.

This is what `UADEVariablePatternLayout.blockRows?: TrackerCell[][]` is for
(`src/engine/uade/UADEPatternEncoder.ts:237`). Formats whose display cells ARE
their carriers (most variable formats) leave it undefined; command-stream
formats set it.

---

## 3. Decode the command stream (carriers)

Two small functions carry the whole codec:

**`rhCommandLen(buf, pos)`** — command length table. Read the opcode byte, return
how many bytes it consumes. This is the ONLY place the wire grammar lives:

```
value >= 0  → 2   (note: duration byte + note byte)
-128        → 2   (sample change)   -127 → 2 (portamento)   -126 → 2 (rest)
-125        → 1   (sustain flag)    -124 → 1 (BLOCK END)     -123 → 1 (song end)
-122 / -121 → 2   (volume set variants)
default     → 1   (unknown — consume one byte, never desync)
```

**`decodeRHBlock(buf, startAddr, sampleRef)`** — walk from `startAddr` to and
including the `-124` terminator, one `TrackerCell` per command. Each cell stashes
the raw bytes as carriers:

```
cell.cutoff = len            // command length (also: "is this a real command?")
cell.period = buf[pos]       // opcode byte 0
cell.pan    = buf[pos+1]     // opcode byte 1 (only when len >= 2)
```

Display fields (`note`, `instrument`) are decoded too but are cosmetic — the
carriers make the round-trip exact regardless of how note/instrument map.
`sampleRef.cur` threads the running instrument across the block (sample-change
commands update it; note commands read it).

**Encoder** = concatenate carriers. `encodePattern(rows)` walks the carrier rows
and emits `period`, then `pan` when `cutoff >= 2`. That reproduces the block
byte-for-byte. (See `robHubbardEncoder`; test asserts `[...re].toEqual([...orig])`
for every block.)

---

## 4. Build the display grid: shared TICK timeline

The display must let ONE playhead track ALL channels, so row === real tick.
Compute each command's tick length and lay channels on a common timeline.

**`rhCellTicks(cell)`** — how many ticks a command occupies:

```
cutoff === undefined          → 0     (padding row, not a real command)
opcode (period) < 128         → max(1, opcode)      // note: byte0 IS duration
opcode === 130 (-126 rest)    → max(1, pan)         // rest: byte1 is duration
else                          → 0     (control op — mutates state, no time)
```

**Pass 1** (`buildRHVariablePatterns`): for each channel, walk its block list
(looping independently via `blockIdx % list.length`), place each time-advancing
command's note-on cell on its first tick row, then fill `[tick, tick+dur)` as its
span. Control commands (`dur <= 0`) emit no row. Length the timeline to the
LONGEST single channel pass, then loop every shorter channel to fill — so **no
active voice goes silent mid-song** (RH channels have wildly different lengths,
e.g. skateordie `[152,1,75,39]`).

Guards that matter:
- `RH_MAX_DISPLAY_ROWS` ceiling — a pathological loop can't allocate unbounded.
- all-control-only list → `advanced` flag + `singlePassTicks===0` break, so a
  block of pure state ops can't spin forever.

**Pass 2**: slice each channel timeline into fixed 64-row patterns. `row` within
a pattern is a real tick, so the tick-driven playhead sits on the sounding note.
`trackMap[p][ch] = chFpByTick[ch][base]` records which block covers each
pattern's first tick (kept valid for the layout).

---

## 5. Legibility of sustained voices: note-off release markers

Even correct, a sustained voice on a fine tick grid reads as near-empty: a
dur-48 bass note is 1 note-on row + 47 blanks. Users read that as "missing".

Fix (display-only, safe because display is carrier-less): drop a note-off (`===`,
note=97) on each held note's LAST row:

```js
if (cell.note > 0 && cell.note !== 97 && end - 1 > tick) {
  timeline[end - 1] = { note: 97, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
```

- `end - 1`, not `end`: RH is **gapless** — the next trigger lands exactly on
  `end`, so a marker at `end` gets overwritten (→ zero net markers, the first bug
  I hit). `end - 1` is the note's own final row; the next note-on never touches
  it.
- `end - 1 > tick` guard: a dur-1 note is only its attack, no release row.
- skip note 97 (rests are already silence).

Result: sustained voice reads `note-on → held span → === → next note-on`, a
"release-kissing-attack" signature that does not occur without the feature — so
it is directly testable (§6).

---

## 6. Regression tests (all four fail on the corresponding revert)

`robHubbardRoundtrip.test.ts` — the template for this format class:

1. **byte-exact block round-trip** — encode `blockRows[fp]`, assert equals raw
   block bytes. Fails if any command dropped. This is the anti-fake-metric proof.
2. **every channel loops** — a channel active in the first third must still play
   in the last third (catches truncation → silent short channels).
3. **tick timeline honoured** — a note followed by ≥1 blank continuation row
   (catches one-row-per-command collapse).
4. **release markers present** — count `note===97` immediately followed by a
   note-on across all channels; assert `> 20` (catches the `end` vs `end-1`
   gapless-overwrite bug — neutralise the marker and it collapses to 0).

Fixtures: `centurion_battle.rh` (single-pattern, byte-exact),
`skateordie.rh` (imbalanced channels `[152,1,75,39]` — exercises independent
looping + sustained ch3/ch4). Both in `test:ci` glob.

---

## 7. Proof discipline before touching a "missing notes" report

Do NOT "fix" perceived data loss until you have PROVEN whether it's data or
display. "It can not be approximate." Three independent checks distinguished
RH's complaint (it was display, not loss):

1. **byte-exact round-trip** re-encodes every block → file verbatim ⇒ zero
   commands lost.
2. **opcode histogram** of a channel ⇒ zero portamento/sustain "hidden note"
   opcodes; note commands carry no repeat field.
3. **per-channel note-on counts** ⇒ ch3 = 251 note-ons, all channels span 2432
   ticks. Complete.

Only after all three agreed "data complete" was the fix scoped to display
sparseness (the note-off markers), not the decoder.

---

## 8. Applying to the next format

Checklist to port a new command-stream format:

1. Confirm it is the class (§1). If it's actually a fixed grid, use the normal
   per-cell codec path instead.
2. Write the command-length table (`*CommandLen`) from the replayer source /
   disassembly — the single source of wire grammar. `default: 1` so unknown
   opcodes never desync.
3. Write `decode*Block` storing raw bytes as carriers (`cutoff=len`,
   `period=b0`, `pan=b1`, extend with `cutoff2`/etc. if commands exceed 2 bytes).
4. Write the encoder as pure carrier concatenation; assert byte-exact per block.
5. Compute `*CellTicks` (which opcodes advance time, and which byte holds the
   duration).
6. Build the shared tick timeline: per-channel independent looping, length to the
   longest pass, slice to 64-row patterns, `blockRows` on the layout.
7. Add release markers for sustained voices if legibility needs it (display is
   carrier-less — safe).
8. Ship all applicable §6 tests; verify each fails on its own revert.

**Candidate formats in this class** (UADE-custom composer replayers — verify each
against §1 before porting; many are currently `encode-pattern` variable stubs in
the ratchet): davidWhittaker, hippel / hippelCoSo, benDaglish, fredGray,
martinWalker, jasonPage, richardJoseph, sidMon2, daveLowe, musicLine,
pumaTracker. Each is a per-channel command stream, so the same three-layer
separation applies. Do ONE format per session, ratchet-driven.

**Never** edit a shared codec (e.g. `MODEncoder`) to fix one format — it moves
multiple ratchet entries. Command-stream formats each get their own
decode/encode pair, so this risk does not arise here, but the rule stands.
