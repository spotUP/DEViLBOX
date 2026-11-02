# N13a-c result (2026-11-02, uncommitted)

Live MCP: NOT done. "No browser connected" (no DEViLBOX tab open; one-tab rule). Owner to confirm in the wizard.
Measured instead through parseModuleToSong on the shipped templates.

## N13a KRIS
- Cause: KRISParser treated every header whose name[0]==0 as a synth. The exporter writes an unused slot as an all-zero header, so
  23 empty slots became "Synthetic" Sampler instruments with no audio (volume -60). Template: 31 instruments (8 real + 23).
- Fix: KRISParser.ts: an all-zero header with length 0 is an emptySlot, not a synth; trailing empty slots are not listed.
  Now 8 instruments. Real synth headers (zero first byte, parameters in name) still parse as before.
- Test: newSongTemplateDispatch.test.ts "kris: the template lists only instruments that hold audio" (fails with fix reverted: 23 silent).

## N13b Digital Symphony
- Cause: parser pushed all 63 slots; template filled 7 (slots 1,2,6,7), 56+ empty.
- Fix: DigitalSymphonyParser.ts drops trailing audio-less slots; template public/templates/digitalSymphony.dsym compacted (samples 1,2,6,7 -> 1-4,
  via parse, renumber, exportDigitalSymphony; blank patterns, 0 note cells; same 58407 bytes, reparses to 4 instruments). Exporter untouched
  (it already writes missing slots as empty virtual entries).
- Test: same it.each, digitalSymphony (fails reverted: 59 silent). Roundtrip tests (exporterRoundtrip, formats/__tests__) pass.

## N13c Hippel CoSo "with instruments"
- Cause: that choice is the system preset uade_hippelcoso (not the Formats template). Its starters were samp(name) = Sampler with no sample at all,
  so any typed note is silent. Same for every preset using samp() (protracker, octamed, ...).
- Fix: uadeInstrumentPresets.ts samp() now builds a looping one-cycle saw through createSamplerInstrument (AmigaUtils shared shape).
- Test: newSongTemplateDispatch.test.ts "every starter instrument a system preset offers carries audio" (fails reverted: "Lead has no audio").
- Unverified: audible output in the browser; whether CoSo should instead offer real HippelCoSoSynth instruments (needs a sample bank).

type-check passes.
