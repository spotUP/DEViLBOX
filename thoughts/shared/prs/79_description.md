## What broke

A saved state in which every Dub Bus return was closed came back **permanently silent** on the next load, and the UI showed a bus that looked switched on.

Measured on the running machine before this change:

| state | `returnGainNode` | measured return level |
| --- | --- | --- |
| as saved | `0` | **-137 dB** |
| after setting only `returnGain: 0.85` | `0.85` | **-11 dB** |

`returnGain: 0` is the floor the return node collapses to, and -137 dB is digital silence, not "quiet". The saved state also carried `echoWet: 0` and `echoIntensity: 0`, so there was nothing to route into the dead return either.

## Root cause

The persisted CC bank for those parameters matches the **minimum of every mapped CC** (CC47-53 on `IAC Driver Bus 1`) — a coherent "all returns closed, nothing to the tape" snapshot, not a corrupted value. But nothing in the load path treats *all* returns closed as an unusable state, so a state that is unrecoverable in practice is restored and trusted as-is. Once loaded, the bus reports `enabled: true` with an inaudible return, and no control in the UI moves out of it on its own.

## The fix

**1. A closed return is repaired at the two wholesale restore boundaries** — `isDubBusAudible()` / `repairDeadDubBusVoicing()` in `src/types/dub.ts`, applied in the localStorage boot path (`src/stores/useDrumPadStore.ts`) and the project/song restore path (`src/lib/song/applySong.ts`). When the saved return is missing, non-finite, or at/below the collapse floor, the whole return chain (`returnGain`, `echoWet`, `echoIntensity`, `echoRateMs`) is rebuilt from factory.

Deliberately conservative:
- A **quiet but open** return (e.g. `0.1` for a tastefully muted mix) is left alone — only the collapsed state is repaired.
- Non-return voicing (`springWet`, `hpfCutoff`, `stereoWidth`, master bass/scoop) is never touched, so a saved state that is quiet on purpose stays quiet.
- The repair is value-based, not schema-based: **no localStorage version bump**, which would have thrown away programs and mappings to fix a parameter range.

**2. `measure_dub_bus_stages` no longer writes to the store.** The probe used to call `setDubBus(...)` to install its own settings and `setDubBus(saved)` to put them back, which meant a diagnostic tool persisted its settings — and anything that changed the bus in the meantime got clobbered on restore. It now claims the keys, releases them, writes directly to the engine, and reclaims (`src/lib/dub/measurementSettings.ts`). The store is never written, and restore is idempotent.

## Verification

Automated (all green on the branch):
- `npm run type-check`
- affected suites, then a song/lib/dub/store expansion (812 tests)
- final pre-push gate: `test:ci` + `test:compliance`
- 22 new cases: `src/types/__tests__/dubBusDeadReturn.test.ts`, `src/stores/__tests__/dubBusDeadReturnRecovery.test.ts`, `src/lib/dub/__tests__/measurementSettings.test.ts`, plus the project-restore case in `src/lib/song/__tests__/savedProjectAfterAhx.test.ts`
- both bug-case tests were confirmed to fail before the fix (`expected +0 to be 0.85`)

Live, after this change, on the previously silent state:
```
returnGain      0.85      (was 0)
echoWet         0.5       echoIntensity 0.62      echoRateMs 300
returnGainNode  0.85      return level no longer collapsed
```
Non-return fields survived the repair as saved (`springWet: 1`, `hpfCutoff: 20`, `stereoWidth: 0`, `masterBassDb: -12`, `midScoopGainDb: -12`).

## Not included

- **Attribution of the writer.** The saved CC minima identify a plausible source (a CC sweep/virtual-MIDI pass), but that cannot be proven after the fact. This PR makes the state recoverable; it does not add a write audit.
- **A UI affordance** (a "dub bus is inaudible" hint). The invariant is now enforced at load, so it is not required to fix the bug.

## Manual check

1. Reload with the state that was silent — the bus comes back open, and the Return/Echo knobs read non-zero.
2. Fire an `echoThrow` and a `springSlam` and hear the tail.
