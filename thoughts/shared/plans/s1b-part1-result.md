# S1b part 1 result (2026-11-02): nothing newly decoded, no code changed

## Item 1: GT2 rejected tunes
Sample: 150 random GoatTracker_V2.x paths from deepsid.db, fetched from hvsc.c64.org; about 100 downloaded
(the rest returned empty bodies), 97 decode today, rejects tabulated by reason (decoder whyNot callback):
- 2SID stereo build: 5 (Moraff Sydaen_ja_veri_2SID, Lintu_ja_lapsi_2SID, Sherman Cold_Outside_2SID,
  GI-Joe Miomodo_2SID, Mibri Radio_Free_Truth_2SID; 2 more in later rows). Biggest group.
- Older layout ("wave table reference" / "table layout"): Bayliss Tower_of_5_25_Disks, Xtense Test,
  Kozaki_Soft Phiwum_Ojach (+2 more). Confirmed from refs: freq table, instrument columns (stride = instrument
  count), tables and speed table sit BEFORE the song table (songLo=$15cb in Tower...), pattern table right after.
- "pattern length" (zero-row pattern): FieserWolF Girls_Love_Lasers, Widding Lumberjack_Deluxe_preview, one more.
  Last pattern's pointer/data runs off the file end and an orderlist plays it; not decodable, correct to reject.
  A try at skipping unplayed empty patterns changed no tune; reverted.
Not done: 2SID needs 6-channel orderlists in a GTS5 song the editor opens (GTUltra supports 2SID; check
writeGoatTrackerSng/gsong.c channel count first). Older layout needs the pre-2.6 greloc.c packer order, and the
GoatTracker 2.77 source is NOT at /Users/spot/Downloads/GoatTracker_2.77/src (path does not exist; only
GTUltra's gtultra-wasm/src/greloc.c on disk). Fetch 2.77/older source from sourceforge before starting.

## Item 2: CheeseCutter 2.x
Editor EXISTS (src/components/cheesecut, useCheeseCutterStore, CheeseCutterParser.ts reading a .ct: "CC2" + zlib
64K C64 image, pointer table at $0FA0, metadata at $10000). No SID decoder written. Findings for whoever builds it:
- The SID is the acme-assembled player_v4.acme + dumpData() (github theyamo/CheeseCutter src/ct/dump.d, build.d),
  data order after the player: arp1, arp2, filttab, pulstab, inst0..inst7 (8 columns, maxInsno+1 each), seqlo,
  seqhi, cmd1-3, songsets (3 track ptrs + speed,7 per subtune), tracks (compacted), sequences (compacted), chord,
  chordindex. Sizes come from the player's table references (same technique as GoatTrackerSid.ts).
- The packed form is not the .ct image: the decoder must expand compact sequences/tracks (base.d Sequence.compact,
  subtunes.compact) and synthesise a .ct (editor player image + offset table) or feed CheeseCutterLoadPayload
  directly (preferred: skips the image). 329 CheeseCutter tunes in deepsid.db; 1 .ct sample on disk
  (public/data/songs/cheesecutter/abaddon-trouble.ct) but no matching SID, so no answer key; the answer key
  would be a .ct exported with ct2util (src/ct2util.d) from that .ct.
- Scratch copy of the three sources: scratchpad ccsrc/ (deleted).
Estimated size: one agent, ~1 session.

## Next (main session, 2026-11-02)
- CheeseCutter SID decoder: in scope under the S1b "both in parallel" decision; queued after N13a-c.
- GT2 2SID stereo: blocked on 6-channel orderlists in the GTS5 writer and GTUltra open path.
- GT2 older layout: fetch GoatTracker 2 source first (not on disk).
