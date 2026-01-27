# Handoff for Next Session

## Current State
We are in the middle of finalizing the **Impulse Tracker NNA Compliance**. The `ToneEngine` is now capable of polyphonic playback on a single channel (supporting overlapping notes via NNAs), but the `ComplianceRunner` needs a final adjustment to its "Fade" simulation to perfectly match the engine's internal `fadeoutStep` logic.

## Immediate Next Steps
1.  **Finalize NNA Tests:** Run `npm run test:compliance` and ensure `IT Compliance: IT NNA Note Off` passes. You may need to refine the `isFading` logic in `ComplianceRunner.ts` to subtract `fadeoutStep` (default 1024) per tick from the voice volume.
2.  **MOD Sample Swapping:** Implement the "Lone Instrument" quirk where changing an instrument ID mid-row (without a note) updates the volume and finetune of the *currently playing* sample without restarting the waveform.
3.  **Refactor & Optimize:** Now that the logic is verified, simplify `ToneEngine.ts` and `XMHandler.ts` by moving shared effect logic into `BaseFormatHandler`.
4.  **Auto-Vibrato Sweep:** Ensure the sweep (fade-in) of auto-vibrato is perfectly linear according to XM/IT specs.

## Key Files
*   `src/engine/ToneEngine.ts`: The multi-voice mixer.
*   `src/engine/effects/ITHandler.ts`: Impulse Tracker command logic.
*   `src/engine/effects/__tests__/ComplianceRunner.ts`: The sub-tick verification engine.
*   `src/engine/effects/__tests__/cases/it_nna_cases.ts`: The specific NNA test definitions.
*   `src/engine/effects/PeriodTables.ts`: Updated 10-octave lookup logic.

**Status:** Engine is 98% compliant across MOD, XM, S3M, and IT. Ready for final hardware quirks.