# Scratch Originals - provenance

Owner-plan section 15 (licensing check) and ledger item SCR-P0.4
(`thoughts/shared/plans/2026-10-11-scratch-dj-progress.md`).

## Source

- Recordings: "Scratch Originals" by Phase, the owner's own scratch session,
  chopped from one continuous take (`ScratchOriginals_Phase.wav`) into
  `scratch_001.wav` .. `scratch_057.wav` (stereo, 44,100 Hz, 24-bit PCM).
- The same recordings are the record crate of the Up Rough Demo System
  (`Up_Rough_Demo_System/scratch-originals/`, named files such as `1.wav`,
  `fresh.wav`). `scratch_bank_metadata.json` here is that crate's analysis
  (50 records); each record's `packFile` names the byte-identical pack file.
- Not copied from the Up Rough crate: `if-you-really-like-to-rock-the-funky-beat.wav`
  (a sampled phrase of unknown origin; stays out until its source is known).

## Redistribution decision

Owner, 2026-10-11: the recordings are the owner's and are redistributable.
They are committed in this public repository and deployed with `public/`.

## Files without a catalogue record

`scratch_020`, `scratch_040`, `scratch_049`, `scratch_053`, `scratch_054`,
`scratch_055`, `scratch_056` have no entry in `scratch_bank_metadata.json`.
Owner decision 3 (2026-10-11): FX pack only; never a performer source until
records are produced for them with the Up Rough analyser.
`scratch_052.wav` (a click artifact) is kept out of the sample browser
(`SCRATCH_SKIPPED` in `src/constants/samplePacks.ts`).

## Byte-identity check

Run from this directory with the Up Rough crate checked out:

```sh
CRATE=/Users/spot/Code/Up_Rough_Demo_System/scratch-originals
jq -r 'to_entries[] | "\(.key) \(.value.filename) \(.value.packFile)"' scratch_bank_metadata.json |
while read -r name src dst; do
  if cmp -s "$CRATE/$src" "$dst"; then echo "[OK] $name $dst"; else echo "[DIFF] $name $src -> $dst"; fi
done
```

Every line must read `[OK]`; a `[DIFF]` means the pack file and the crate
file have drifted and the metadata (anchors, safe ranges, word slices) no
longer describes the audio that ships.
