# N13c result: CoSo New Song starters are real HippelCoSoSynth instruments

Source song: public/data/songs/hippel-coso/wings of death (level 3).hipc, instruments 1, 2, 3, 5 (1-based). Built by the existing parser parseHippelCoSoFile (no second builder); output frozen in src/constants/data/hippelCosoStarters.json (42 KB), regenerated with REGEN_HIPPEL_STARTERS=1.

Files changed:
- src/constants/uadeInstrumentPresets.ts (uade_hippelcoso uses HIPPEL_COSO_STARTER_INSTRUMENTS; exports HIPPEL_COSO_STARTER_SOURCE)
- src/constants/data/hippelCosoStarters.json (new)
- src/constants/__tests__/hippelCosoStarters.test.ts (new)
- src/lib/export/HippelCoSoExporter.ts (sample bank built from instrument hippelCoso.samples when song has no hippelFileData)
- src/lib/song/__tests__/newSongTemplateDispatch.test.ts (old saw assertion replaced: "the CoSo system preset offers CoSo instruments")

Tests (all pass): drift "matches what the CoSo parser builds from the source song"; "the system preset offers HippelCoSoSynth instruments with sequences and sample data, not Sampler saws"; "a New Song built from the starters exports through the native router as CoSo, sample bank included" (COSO magic, re-parse has PCM); "a note on each starter renders audio through the CoSo voice" (previewVoice, peak > 1e-3); dispatch test above.

Revert check: with the preset line put back to saw samp() starters, 4 of the new/changed tests fail (dispatch test, sequences/sample test, export test, render test); drift test still passes (asset-only). Line restored afterwards.

type-check: npm run type-check exit 0, 0 errors.

Open: a preset-path New Song (system preset, no kind:'format') carries no layout id, so nativeExportRouter does not recognise it as CoSo. Test builds the song from the hippelCoSo template parse (carries layout), hippelFileData removed, instruments replaced by starters. Format-path New Song (template with hippelFileData) copies the template bank and ignores starter samples.
