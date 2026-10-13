# Juggle records - provenance

Owner decision 2026-10-12 (ledger `thoughts/shared/plans/2026-10-12-scratch-full-demo-port.md`, J3 / J6):
"SHIP the amen break and the hip-hop juggle records; owner owns/cleared them."

- `amen_break_175.wav`: the Up Rough Demo System's `Data/Music/amen_break_175.wav`, byte for byte
  (three_deck.py `REAL_BREAKS['amen']`: 175 BPM, its second bar fitted to the routine's tempo).
- `<style>_<key>.f32.wav`: the bar `beat_juggle.make_hiphop_record` fits for the three-deck routine's
  `THREE_DECK_RECORDS` (golden_era Am, east_coast Cm, g_funk Gm, lofi Dm, memphis Em): `hiphop.render_track(style,
  key, seed=i, rate=22050, section='hook', bars=3, vintage=False)` bar 1 at the style's own tempo, mono 32-bit
  float (the demo's float render, so the routine's A/B layer nulls against the demo's).

Written by `tools/scratch-fixtures/gen_beat_juggle.py` from the demo at commit 5e53c9e14.
