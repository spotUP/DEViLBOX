---
date: 2026-10-01
topic: dub bus dead return recovery
tags: [dub, store, persistence, midi, mcp]
status: implemented
---

# The dub bus can be left permanently inaudible

## Symptom

"moves light up but nothing is heard". `measure_dub_bus_stages` on the live
page: stages upstream of the return carry signal, `return_` measures
**-137 dB**. Applying only `returnGain: 0.85` brings it to **-11 dB**.

## Measured cause

`useDrumPadStore.dubBus` (persisted whole on every `setDubBus` write, and
rehydrated verbatim) held:

    returnGain 0 (factory 0.85), echoWet 0 (0.5), echoIntensity 0 (0.62),
    echoRateMs 40 (300), springWet 1, hpfCutoff 20, sidechainAmount 0

`DubBus.return_` is the last node before the master and the ONLY path to the
speakers for the whole wet bus — echo, spring and every generated move layer
(siren, stab, crack, sub, reverse) connect to it. Return 0 mutes all of it.
Boot forces `enabled: false` and rehydrates the rest as saved, so every
session started dead. The two recent fixes (a62bee933, b7e30765f) made the
node faithfully follow the store; the store said 0, so the engine is now
correctly silent.

The stored values are an exact snapshot of the CC47-53 bank at minimum
(`parameterRouter.ts:150-156` maps echoIntensity/echoWet/echoRateMs/
springWet/returnGain/hpfCutoff/sidechain there; every CC writes the persisted
store). Something dumped that bank; the app has no way to tell a machine write
from a hand.

## Levels the fix could live at

- **Data / persistence** — the store rehydrates a dead voicing verbatim, and
  nothing ever repairs it. ROOT.
- **Domain invariant** — "a bus with a closed return cannot make sound" is not
  a voicing, it is a dead bus. Same level, stated as a rule.
- **Input (MIDI)** — soft takeover would stop a bank dump slamming values.
  REJECTED: tried in 9a4279838, reversed the same day, replaced by `HandBook`
  in 3bd4ee786 ("let the hand win"). Not re-litigating.
- **Presentation** — a warning badge on the deck. A band-aid; the bus is still
  dead. Not doing it.
- **Diagnostic (MCP)** — `measure_dub_bus_stages` writes its probe through the
  PERSISTING store (`writeHandlers.ts:466` + `:511`), so a reload mid-probe
  strands the probe on disk. Real corruption vector, proven in code. ROOT for
  the tool itself.

## Chosen fix

1. `repairDeadDubBusVoicing()` in `src/types/dub.ts` — a closed return means
   the tail fields are wreckage, so restore the tail (`returnGain`, `echoWet`,
   `echoIntensity`, `echoRateMs`) from factory. Everything else is left alone:
   an open return is the performer's choice however quiet, and a dry echo is a
   choice too. Called from the rehydrate merge, beside the existing
   `gatedFlanger` -> `jammy` repair.
   NOT a schema bump: v29 would wipe every program and MIDI mapping.
2. `applyEphemeralDubSettings()` in `src/lib/dub/measurementSettings.ts` — a
   probe goes to the ENGINE (`setSettings`) behind `claimSettingKeys()` so the
   store->engine mirror cannot revert it, and the store is never written. A
   reload mid-probe now discards the probe instead of stranding it.
3. `writeHandlers.measureDubBusStages` uses it.

## Verification

- `src/types/__tests__/dubBusDeadReturn.test.ts` — the rule (dead bank
  repaired, open return untouched, idempotent, non-finite treated as dead).
- `src/stores/__tests__/dubBusDeadReturnRecovery.test.ts` — REACHABILITY:
  `loadFromStorage()` (the boot entry point) on a crafted localStorage blob;
  asserts the tail is rebuilt AND a non-tail field survived, so it fails on
  the reset path rather than passing for the wrong reason.
- `src/lib/dub/__tests__/measurementSettings.test.ts` — the probe reaches the
  engine, the store is never touched, restore releases the claim BEFORE
  writing (a claim drops writes, so the other order is a silent no-op).
- `npm run type-check`, targeted vitest.

## Not done here (owner's call)

- Who wrote the zeros (IAC loopback vs an external app vs an MCP session) is
  not provable after the fact; nothing here depends on the answer.
- The audit verdict in `moveAudibilityLog.ts` is level-only, so `hpfRise` and
  `delayTimeThrow` read SILENT while working. Separate concern.
