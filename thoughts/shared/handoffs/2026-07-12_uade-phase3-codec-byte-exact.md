---
date: 2026-07-12
topic: uade-phase3-ratchet-driven-byte-exact-codecs
tags: [uade, editability, phase3, roundtrip, ratchet, codec]
status: in-progress
---

# UADE Editability Phase 3 — ratchet-driven byte-exact codecs

## Task

Raise UADE cell codecs to byte-exact round-trip (`encodeCell(decodeCell(bytes)) === bytes`),
ONE format per session, driven by `src/engine/uade/__tests__/encoderRoundtrip.ratchet.json`
(the Phase 3 backlog). Each cycle: pick next-closest-to-byte-exact lossy `decode-encode`
format, root-cause fix (right abstraction, no band-aid), back with revert-checked regression
in `test:ci`, commit with regenerated ratchet, push direct to main, update MEMORY.md.

## Recent changes (this session, all pushed to main)

Shipped 4 formats to 1.0 byte-exact, all via the SAME abstraction:

| commit | format | ratchet | cells | fixture |
|--------|--------|---------|-------|---------|
| 328952d41 | soundfx | 0.969→1.0 | 256 | operation_stealth.sfx |
| 11857bb00 | symphoniePro | 0.993→1.0 | 20480 | pas 2 jade.symmod |
| 1ed97d16c | tfmx7v | 0.9847→1.0 | 24640 | ghostbattle_gameover.hip7 |
| 7cced2419 | graoumfTracker2_gt2 | 0.9681→1.0 | 3072 | living-on-video.gt2 |

(earlier local, pre-session: deltaMusic2 2531965fb, jamCracker 6c343238e, wallyBeben
13bd3143f, synthesis 7909a16a9 — see MEMORY.md "Recent sessions" for each.)

### graoumfTracker2_gt2 (last, 7cced2419) — detail

- 5-byte GT2 cell `[note, instr, effect, param, volume]`.
- 98/3072 fails on 3 lanes:
  - byte2 effect (14) + byte3 param (22): `translateEffect` is many-to-one —
    `0xA8`→XM `0x0F`→`0x0F`, `0x11`→dropped `[0,0]`.
  - byte4 volume (64): decode `÷4` (codingVersion 0), encode `+0x10` (codingVersion 1)
    → `64→16→32`. codingVersion is per-pattern, unknown to single-cell decoder.
  - note/instr (byte0/1): already lossless.
- FIX: `GraoumfTracker2Parser.ts` GT2 `decodeCell` (~line 1147) stashes raw
  effect/param/volume in invisible carriers `period`/`pan`/`cutoff`;
  `GraoumfTracker2Encoder.ts` `applyGT2ByteExactCarriers` reproduces bytes 2/3/4 verbatim.
- Private codec: grid built by parser's own `rawPatterns` loop (~line 1003, no carriers),
  `encodeGT2Cell` IS registered via `registerPatternEncoder('graoumfTracker2_gt2')` but an
  edited grid cell arrives carrier-less → keeps lossy derivation. Round-trip / chip-RAM
  path is the only carrier producer.

## The established fix pattern (used 8× now)

Root cause is always the same shape: `decodeCell` renders a LOSSY XM-ish view for the
editor grid; `encodeCell` derives bytes back from that view; the derivation is not the
inverse of the parser's real decode (many-to-one effect maps, codingVersion ambiguity,
sentinel bytes, out-of-table periods, note-offset bugs).

FIX abstraction (codec cell-model level, NOT presentation, NOT band-aid):
1. `decodeCell` stashes the EXACT lossy source bytes in invisible TrackerCell carrier
   fields — `period`, `pan`, `cutoff`, `eff2` (fields not rendered in the editor's
   note/instr/vol/effect columns).
2. `encodeCell` (usually a small `applyByteExactCarriers`/`apply*ByteExactCarriers` helper)
   reproduces those bytes verbatim WHEN PRESENT, on EVERY return path (watch command
   early-returns and note<=0 early-returns — route them ALL through the helper).
3. Carriers must be truly private: the editor GRID is built by a SEPARATE parser loop
   that does NOT set carriers, and native export must not read them. An edited cell
   therefore arrives carrier-less and falls back to the lossy derivation (acceptable —
   the user changed it, canonical encoding is correct). Verify this separateness every
   time before shipping — it's what makes the carrier safe.

Guard variant (soundfx): when the carrier could be stale for an edited cell (period vs a
new note), guard with an invertibility check (`periodMatchesNote`) so an edited note falls
back to canonical.

## Critical references

- Backlog / ratchet: `src/engine/uade/__tests__/encoderRoundtrip.ratchet.json` (key `results`).
- Harness: `src/engine/uade/__tests__/encoderRoundtrip.harness.test.ts`.
  Regen: `DEVILBOX_GEN_RATCHET=1 npx vitest run --config vite.config.ts src/engine/uade/__tests__/encoderRoundtrip.harness.test.ts`
- Fixture map: `src/engine/uade/__tests__/fixtures.map.ts`.
- Shared cell offset helper: `getCellFileOffset(layout,p,r,c)` exported from
  `@engine/uade/UADEPatternEncoder` (handles both `getCellFileOffset` method and contiguous).
- `UADEPatternLayout` fields: `decodeCell`, `encodeCell`, `getCellFileOffset?`,
  `bytesPerCell`, `rowsPerPattern`, `numChannels`, `numPatterns`, `patternDataFileOffset`.
- test:ci glob: `package.json` line 30. Insert new `*Roundtrip.test.ts` before
  `tcbTrackerRoundtrip.test.ts`.

## Learnings / gotchas

- `dist/version.json` ENOENT during vitest close = known-harmless noise. Ignore.
- Pre-push hook output is very noisy (Tone.js logs, Sampler logs); first `git push` can
  spuriously report "failed to push some refs" mid-noise — RETRY, then verify
  `git log origin/main --oneline -1` matches local HEAD. Happened again this session
  (graoumf push #1 failed, #2 succeeded).
- Probe test files MUST live under `src/lib/import/formats/__tests__/` (or another src
  dir) so vite `@/`/`@engine`/`@lib` aliases resolve. Delete probes after use.
- Revert-check protocol: `git stash push <parser> <encoder> -q`, run the regression
  (MUST fail), `git stash pop -q`. Do this before every commit.
- Ratchet single-format diff check (python): load HEAD ratchet vs working, assert ONLY
  the target format's matchPct changed.

## Workflow per format (repeat exactly)

1. Read parser layout `decodeCell`/`encodeCell` + `getCellFileOffset` + fixture path.
2. Write temp `_xprobe.test.ts`: iterate all cells, `encodeCell(decodeCell(orig))`,
   count fails per-byte, print ~25 sample `orig[...] re[...]` pairs. Categorize lanes.
3. Confirm codec is private (grid built by separate loop; native export path).
4. Apply carrier fix (decodeCell stash + encoder `apply*ByteExactCarriers` on ALL returns).
5. Re-run probe → 0 fails. Delete probe.
6. Write `xRoundtrip.test.ts`: byte-exact over all cells + assert the exercised lossy
   lane(s) actually fire in the fixture (guards against a vacuous test).
7. Add to test:ci glob. `npm run type-check` (must pass). Run the regression (pass).
8. Revert-check (must fail). Regen ratchet, confirm single-format diff.
9. `git add` by name (parser, encoder, test, ratchet, package.json), commit with
   Co-Authored-By trailer, push, verify origin.
10. Update MEMORY.md "Recent sessions".

## Next steps

Remaining `decode-encode` lossy backlog (top of ratchet, 53 total):

```
0.9599  stp            <- NEXT
0.9192  activisionPro
0.6691  mtm
0.6537  unic
0.6469  sonicArranger
0.6341  gameMusicCreator
0.5137  soundMon
0.4779  zoundMonitor
0.4648  specialFX
0.4414  nru
```

The high-0.9x ones (stp, activisionPro) are quick-wins (few lanes, carrier fix).
Below ~0.67 the codecs are more structurally lossy — will need per-format analysis,
not necessarily a pure carrier fix. Keep one-format-per-session cadence.

## Other notes

- House rules held: root-cause / right-abstraction / no band-aid; regression fails-on-revert
  in test:ci glob; real song fixtures only; `git add` by name; no `--no-verify`;
  push direct to main; Co-Authored-By trailer.
- Caveman mode active (full) — does not affect commits/PRs/handoffs (written normal).
