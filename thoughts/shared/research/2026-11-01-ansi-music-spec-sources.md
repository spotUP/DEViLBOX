# ANSI music spec findings (2026-11-01)

Primary sources:
- SyncTERM cterm.txt (CTerm): https://gitlab.synchro.net/main/sbbs/-/raw/master/src/conio/cterm.txt  (lines ~646-680, 1479-1585). cterm.adoc not found at tried URLs.
- Terminate ANSI MUSIC doc / SMILE doc: https://discmaster.textfiles.com/file/18224/World_Of_Computer_Software-02-387-Vol-3of3.iso/t/ter61.zip/DOCS._XE/ANSMUSIC.DOC
- Microsoft QBasic/GW-BASIC PLAY: NOT fetched (qbasic.net 403). Statements about MS values below are from memory = UNVERIFIED.

## Claims
1. Intros: CONFIRMED with detail. CSI M (conflicts with Delete Line; only when CSI = 2 M), CSI N (BananaCom), CSI | (CTerm's own). CSI M followed by first char in "BbFfLlSs", or N/n not followed by a digit, is treated as if an M precedes (so "MF","MB","ML","MS","MN" are the music M-command, not notes). Mode switch `CSI = Ps M` (CTSAM), default Ps=0: 0 = only CSI |; 1 = CSI | and CSI N; 2 = CSI |, N and M (Delete Line then unavailable). Doc also says "By default, CTerm allows both CSI N and CSI |" (contradicts Ps=0 default in the same file; the Ps default is 0 in the CTSAM entry).
   Allowed chars: "aAbBcCdDeEfFgGlLmMnNoOpPsStT0123456789.-+#<> " ; any other char => whole string AND intro ignored.
   Introduced by Qmodem/TeleMate (per cterm.txt).
2. Terminator: 0x0E CONFIRMED ("CSI M <music string> 0x0e"). SMILE additionally ends on next ESC or end of line if 0x0E missing (viewer leniency, not standard). cterm.txt recommends sending 0x0F after music to undo SO shift.
3. PLAY ranges:
   - O 0-6 CONFIRMED (>6 clamped to 6; default 4 per cterm). < and > clamp 0..6.
   - N: cterm says 0-71 (invalid = silence; "Note zero is C in octave 0"). Research doc's 0-84 WRONG for CTerm (84 is GW-BASIC, unverified here). Note: cterm says N0 = C0, i.e. no rest at 0.
   - L 1-64 CONFIRMED; default length 4.
   - T 32-255, default 120 CONFIRMED (clamped).
   - P is a pause note CONFIRMED (takes length+modifiers like a note).
   - MN/MS/ML: cterm gives no 7/8, 3/4, 1/1 fractions; only "normal / legato / staccato". The fractions are from MS docs = UNVERIFIED.
   - Dots: CTerm: 1.5x, NOT cumulative ("C.." == "C."). Research doc says dots cumulative (1.5x each): WRONG for CTerm (GW-BASIC differs: unverified).
   - '#', '+' sharp; '-' flat, each repeated modifier moves one more semitone in CTerm ("C++" == D). Doc implies single.
   - Notes: length digits after note OK; default note length 4.
   - Frequencies (CTerm): C at O0..O6 = 65.406, 130.81, 261.62, 523.25, 1046.5, 2093, 4186 Hz. So in CTerm O2 C = 261.62 and O2 A = 440 Hz; O4 default octave C=1046.5 Hz (A4 = 1760 Hz). SMILE table (rows of 12, first row C=65): A at row 3 = 440. WARNING: this is one octave above GW-BASIC/QBasic (where, from memory, O3 C = middle C 261.63 and N37 = middle C; UNVERIFIED). CTerm admits lower octaves are not exact halves (integer-rounded).
   - Research doc "MF/MB scheduling only": CTerm: MF waits for completion, MB lets processing continue (CTerm: all music foreground per search summary, unverified).
4. Volume / extra voices: NONE in CTerm text (no V command, single voice). SyncTERM waveform: not mentioned in cterm.txt ANSI music section = no evidence of other waveforms (UNVERIFIED beyond that file). SMILE/ANSIPLAY had a non-standard SOUND form `ESC[MF Freq;Dur;Cycles;Delay;Variation <0x0E>` (freq 0-65535 Hz, ms): extension, not portable.
5. PC speaker in DOS terminals: UNVERIFIED by a primary source (docs say Qmodem/TeleMate/Terminate play "melodies"; speaker is implied by 1980s DOS but no doc fetched states it). 

## Sample files
NONE found. Scanned ~200 16colo.rs packs (1993-1996, via https://api.16colo.rs/v1/year/YYYY, each pack extracted, files <200 KB, regex ESC[ (M|N||) + PLAY letters + 0x0E): zero hits. Art packs generally strip music. synchro.net Modem.Madness/SMMANSI/10_MORE.ZIP ("Art & Music") and AASS204.ZIP ("will play Ansi Music") exist but downloads returned HTTP 401. textfiles.com host refused connection. 
A real music string from Terminate doc (LOGO.ANS example) usable as a hand-built fixture, ESC + "[MB O3 T120 L2CO4CO3L6BGABO4L2CO3L2CL2AL1GL2CFL4EL6CDEL4FL3DL6O2BO3CDL4EL2C" + 0x0E.
Next leads (untried): discmaster.textfiles.com CD-ROM ISOs with BBS menu sets / MUSIC dirs (e.g. megacd_rom_1 MUSIC/ANSIPL20.ZIP), Terminate (ter61.zip) demo files.
