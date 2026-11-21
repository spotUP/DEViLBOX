#!/usr/bin/env python3
"""Stage a module + its EaglePlayer for the UADE backend, and size the arenas.

Emits, into --outdir:
    current.uademod          the module, verbatim
    current.uadeplayer       the player hunkexe, verbatim
    uade_sizes.i             vasm equates the glue includes

The sizes are the point. Two of them are exact and computed here; two are
per-module measurements the device reports and cannot be derived statically:

  UADE_MODULE_BYTES  exact -- the file size.
  UADE_RELOC_BYTES   exact -- summed from the player's HUNK_HEADER the way
                     amigasrc/score/relocator.s lays the hunks out (each hunk
                     8-byte aligned), which is also what uade.c's
                     calc_reloc_size() does.
  UADE_POOL_BYTES    score's AllocMem arena for MEMF_CHIP requests.
  UADE_ANY_BYTES     ditto for everything else -- this is where a player's big
                     non-DMA buffers go. AHX alone asks for 412,148 bytes for
                     its waveform table, which is exactly why the arenas are
                     split; served from chip it would not fit a 512 KB A500.

For the last two, run the probe (`amiga/uade_probe.s`) against the module and
read the high-water marks it publishes -- chippoint for the chip pool and
uade_anypoint for the ANY pool -- then pass them here. Guessing low is safe
but not silent: score's PORT'd bound check reports
"uade: AllocMem past end of pool" and stops, rather than scribbling through
the demo's bitplanes.

Usage:
    uade_stage.py --module M [--player NAME] [--uade-root DIR] [--outdir out]
                  [--pool-bytes N] [--any-bytes N]
    uade_stage.py --playlist demo.json [--uade-root DIR] [--outdir out]
                  [--vendor-from DIR] [--target-cpu CPU]
"""
import argparse
import json
import os
import re
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hunkdump  # noqa: E402  -- reuse the repo's hunk parser, do not re-implement
import uade_lookup  # noqa: E402
import uade_arena_table  # noqa: E402  -- the measured per-player sizes

# Defaults with headroom, from the AHX pilot measured on device (2,576 chip /
# 412,152 any). A format that needs more fails the build loudly, not silently.
# 64 KB, not 16: MusiclineEditor exhausted 16 KB and died with score's own
# "AllocMem past end of pool". The right number is per-module and comes from the
# device (read chippoint's high-water); this is a default that does not fail the
# common case.
DEFAULT_POOL = 65536
DEFAULT_ANY = 458752

# Arena layout MIRRORS amiga/uade_glue.s's UADE_ARENA_BYTES exactly:
#   UADE_ARENA_BYTES equ $1000+UADE_RELOC_BYTES+UADE_RELOC_SLACK+UADE_MOD_SLACK
#                        +UADE_MODULE_BYTES+1024+UADE_POOL_BYTES
# If that equate ever changes, these four constants must change with it.
ARENA_HEAD = 0x1000
RELOC_SLACK = 0x4000
MOD_SLACK = 0x2000
POOL_GAP = 1024

def with_margin(measured):
    """An eighth on top, never less than 16 KB.

    The high-water is read at one moment during playback, and re-reading AHX a
    minute apart moved it by 6% (45,588 -> 48,300), so a flat measurement is not
    a ceiling. A PERCENTAGE alone is wrong at both ends: it gives a format that
    allocates nothing no headroom at all, and it would add 100 KB of waste to
    AHX's 412 KB fixed waveform tables, which do not vary with the tune. An
    eighth plus a 16 KB floor covers the observed drift at the small end and
    stays close to the measurement at the large end.

    Being wrong here is LOUD, not silent: score's own allocator stops with
    "AllocMem past end of pool" rather than scribbling past the arena.
    """
    return measured + max(measured // 8, 16384)


MIN_CPU_TABLE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'amiga', 'uade_player_min_cpu.tsv')

CPU_ORDER = ['68000', '68010', '68020', '68030', '68040', '68060']


def min_cpu_for(player):
    """-> (min_cpu, why) for a player that needs better than a 68000."""
    try:
        with open(MIN_CPU_TABLE, encoding='utf-8') as fh:
            for line in fh:
                if not line.strip() or line.lstrip().startswith('#'):
                    continue
                f = line.rstrip('\n').split('\t')
                if len(f) >= 2 and f[0] == player:
                    return f[1], (f[3] if len(f) > 3 else '')
    except OSError:
        pass
    return None, ''


def relocated_size(player_path):
    """Bytes the relocated player occupies, mirroring relocator.s's layout."""
    data = open(player_path, 'rb').read()
    if hunkdump.read32(data, 0) != hunkdump.HUNK_HEADER:
        raise SystemExit(f"{player_path}: not a hunkexe (no HUNK_HEADER)")
    off = 4
    while hunkdump.read32(data, off) != 0:      # resident library names
        off += 4
    off += 4
    table_size = hunkdump.read32(data, off)
    first = hunkdump.read32(data, off + 4)
    last = hunkdump.read32(data, off + 8)
    off += 12
    total = 0
    for _ in range(last - first + 1):
        words = hunkdump.read32(data, off) & 0x3FFFFFFF
        off += 4
        # relocator.s rounds each hunk up and leaves room for its pointer
        total += words * 4 + 8
    if table_size != last - first + 1:
        print(f"  note: header table_size {table_size} != hunk count "
              f"{last - first + 1}", file=sys.stderr)
    return total


def loadseg_bytes(module_path):
    """Chip the score hands out when the PLAYER LoadSeg()s the module itself.

    Some deliplayers do not parse their module -- the file IS an AmigaDOS
    executable and the player LoadSeg()s it (CoreDesign, BenDaglish-SID,
    FredGray, FuturePlayer, DaveLowe). For a LoadSeg of the module's own name
    score's dos_loadseg relocates straight from moduleptr (PORT: SELF-LOADSEG,
    no file copy); relocator.s hands out a chip block per hunk from the
    `chippoint` bump pointer -- including BSS hunks, which cost nothing in the
    file and everything in the arena. So the charge is the relocated hunks
    only (measured on DaveLowe: chippoint moved by exactly this number).

    NEITHER bump is bounded upstream, because UADE's emulated machine is chip
    RAM end to end. Here the arena is a fixed block with the demo's bitplanes
    above it: `dynamite dux.core` is 156,532 bytes with a 156,164-byte hunk, so
    it walked 247 KB past _uade_arena_end and straight through the selector's
    planes -- measured 2026-09-23, the owner's "graphics corrupted" on song 12,
    with the demo still running and still switching songs.

    Counted here so the arena FITS them. The two guards that stop an unsized
    one scribbling anyway are amiga/uade_glue.s's LOADFILE bound and
    relocator.s's per-hunk bound.
    """
    with open(module_path, 'rb') as fh:
        head = fh.read(4)
    if len(head) < 4 or hunkdump.read32(head, 0) != hunkdump.HUNK_HEADER:
        return 0
    # Only the relocated hunks: score's dos_loadseg relocates a LoadSeg of the
    # module's own name straight from moduleptr (PORT: SELF-LOADSEG), no file copy.
    return relocated_size(module_path)


DTP_EXTLOAD = 0x8000445D


def player_needs_extload(player_path):
    """True when this player declares DTP_ExtLoad in its Delitracker tag list.

    Whether a song needs a companion file is a property of its PLAYER, never of
    what happens to sit next to the module on disk. Keying it on filename
    adjacency (which an earlier version did) rejects the headline musicdisk
    case outright: the canonical AHX naming is `AHX.<title>`, stem_of() reduces
    that to "ahx", so the FIRST playlist with two AHX songs looked like a
    two-file format to itself and was refused at build time -- with a message
    blaming DTP_ExtLoad, which AHX does not use. A rendered `x.wav` beside
    `x.hip`, or a Samples/ directory anywhere under Data/Music, did the same to
    every song in every playlist.

    Read the answer from the player binary instead. The tag list is plain data
    in the hunk: the player header's last longword is the tag-list pointer as a
    FILE offset before relocation (score.s's parse_player_tags reads the same
    longword after relocation), and each entry is an unrelocated tag id
    followed by its value. A player whose header does not parse falls back to
    True -- refusing a song we cannot read is the safe direction, and it is a
    build-time message, not a silent device failure.

    A player file that is NOT THERE raises FileNotFoundError rather than
    answering True. "Absent" and "needs a companion" are different failures and
    a bool cannot carry both: on a clean checkout, where only three players are
    tracked, the can't-read fallback made this function report that a missing
    JochenHippel "declares DTP_ExtLoad" -- a tag it declares nothing about,
    being absent. stage_songs checks existence before it asks, so that message
    is already correct there; raising is what stops the NEXT caller reinventing
    the same confusion.
    """
    want = DTP_EXTLOAD.to_bytes(4, 'big')
    if not os.path.isfile(player_path):
        raise FileNotFoundError(
            f"{player_path}: no such player file -- a missing player is not a "
            f"DTP_ExtLoad rejection")
    try:
        data = open(player_path, 'rb').read()
        if hunkdump.read32(data, 0) != hunkdump.HUNK_HEADER:
            return True
        # Scan the CODE/DATA PAYLOADS ONLY, not the whole file. The tag list
        # lives in a hunk payload, and tag ids are constants the relocator
        # never touches, so a literal 4-byte match there is exact. Scanning the
        # whole binary also walks hunk headers, reloc tables and symbol blocks,
        # where a chance 4-byte hit would refuse a perfectly good song at build
        # time with a DTP_ExtLoad message -- precisely the over-rejection this
        # function was written to kill.
        hunks = hunkdump.parse_hunks(data)
        if not hunks:
            return True
        found_payload = False
        for h in hunks:
            payload = h.get('data')
            if payload is None:
                continue
            found_payload = True
            if payload.find(want) >= 0:
                return True
        # A player with no CODE/DATA payload at all is not something we can
        # read an answer out of; refuse rather than guess.
        return not found_payload
    except Exception:
        return True


def stem_of(name):
    """The part that identifies the TUNE rather than the role.

    TFMX names a song `mdat.jaguar` and its samples `smpl.jaguar`; other formats
    put the role last (`jaguar.mdat` / `jaguar.smpl`). Either way the stem is
    what the two halves share.
    """
    base = os.path.basename(name)
    if '.' in base:
        head, tail = base.split('.', 1)
        # role-first ("mdat.jaguar") -> stem is the tail
        if head.lower() in ROLE_WORDS:
            return tail.lower()
        # role-last ("jaguar.smpl") -> stem is the head
        if tail.lower() in ROLE_WORDS:
            return head.lower()
        return base.rsplit('.', 1)[0].lower()
    return base.lower()


# Role words that mark one half of a multi-file format rather than the tune.
#
# A MISSING ROLE WORD IS WORSE THAN NO COMPANION AT ALL. stem_of falls back to
# "everything before the last dot", so for `dns.starball title` the stem became
# `dns` -- which every OTHER dns.* song in the directory also matched. Staging
# then embedded four unrelated songs as "companions" and left the real sample
# bank (smp.starball title) out, and DynamicSynthesizer died with
# AMIGAMSG_SCOREDEAD. Measured 2026-09-22.
ROLE_WORDS = {
    'mdat', 'smpl', 'tfmx', 'tfx',          # TFMX
    'sng', 'ins', 'instr', 'smp', 'samples',  # assorted trackers
    'sdata', 'song', 'snd',
    'dns',                                  # DynamicSynthesizer: dns./smp.
    'sdr',                                  # SynthDream
    'osp',                                  # SynthPack
    'adsc',                                 # AudioSculpture: .adsc + .adsc.as
    # SoundPlayer is the case this table's warning predicted, arriving through
    # a different door: `sjs.tune6` beside `smp.tune6`, 31 tunes to a
    # directory. Without `sjs` here the stem degenerated to "sjs", the
    # shared-bank rule matched every smp.* in the directory, and the 16-file
    # cap staged the first fifteen ALPHABETICALLY -- so smp.tune6, the one
    # file the tune needs, was not among them and SoundPlayer died with
    # AMIGAMSG_SCOREDEAD. Measured 2026-09-22.
    'sjs',                                  # SoundPlayer: sjs./smp.
    'ip',                                   # MusicMaker V8 old: .sdata + .ip
}


# How many files a dedicated sample SUBDIRECTORY may contribute. Bytes are the
# real guard (max_bytes); this only stops a pathological directory.
SUBDIR_LIMIT = 128


def find_companions(module, limit=16, max_bytes=512 * 1024):
    """Files that belong WITH this module -- the samples half of a two-file format.

    DTP_ExtLoad formats ask the host for a second file by name at init time (42
    of UADE's 173 players do). The player knows the name; we just have to be
    able to answer. Mirrors what DEViLBOX does: register the companions before
    the module so the 68k replayer finds them when it asks.

    Two shapes, because the formats use two:

      * SIBLING, same stem -- TFMX's smpl.<tune> beside mdat.<tune>.
      * A COMPANION SUBDIRECTORY holding arbitrarily named sample files. Sonix
        keeps them in Instruments/, ZoundMonitor in Samples/, SUN-Tronic in
        instr/, and the names are not derived from the module's at all
        (perc1.x, bio). DEViLBOX resolves exactly these three by relative path
        -- see its src/lib/import/companionRelativeName.ts, which exists
        because collapsing `instr/perc1.x` to `perc1.x` makes the replayer's
        open miss.
        Only the SIBLING half was collected here, so those formats had no
        samples embedded and SonixMusicDriver died with "ExtLoad failed".

    The table keys on the BASENAME, which is correct for the device: score's
    dos_fixfilename strips the path before the request reaches our trap, and
    uade_find_file strips it again. The subdirectory matters for FINDING the
    files on the host, not for naming them on the Amiga.

    Bounded so a directory holding a whole discography is not embedded.
    """
    d = os.path.dirname(os.path.abspath(module))
    stem = stem_of(module)
    out = []
    total = 0

    # A COMPANION MUST PLAY A DIFFERENT ROLE THAN THE MODULE. Belt to the
    # ROLE_WORDS braces above: when a role-first format's role word is unknown,
    # the computed stem degenerates to that role word and every sibling SONG
    # looks like a companion. A file sharing the module's own role is another
    # tune, never its samples.
    def _role_of(name):
        base = os.path.basename(name)
        return base.split('.', 1)[0].lower() if '.' in base else ''
    my_role = _role_of(module)

    # ...BUT _role_of READS THE PART BEFORE THE FIRST DOT, WHICH IS THE ROLE
    # ONLY FOR ROLE-FIRST NAMES. For a role-LAST name that part is the TUNE
    # name, which the module SHARES with its own sample half, so the guard
    # above threw the samples away and the format died holding nothing:
    #
    #   Infogrames          `advantage tennis-intro.dum` + `.ins`
    #   MusicMaker V8 old   `moveback.sdata`             + `moveback.ip`
    #
    # Both measured 2026-09-22 as DIED(8)/AMIGAMSG_SCOREDEAD with the
    # companion sitting beside the module. So a sibling whose OWN name marks
    # it as a sample half is exempt from the same-role rule -- unless the
    # module is marked that way too, which means we are not looking at a
    # role-last pair at all.
    #
    # This is deliberately narrower than "different extension": a sibling has
    # to carry one of these known sample-half words to be exempt, so a
    # directory of sibling TUNES (the case the guard exists for -- 31 sjs.*
    # tunes, 22 sdr.* tunes) is unaffected. Verified against every ExtLoad
    # format the 68000 ledger records as PLAYS: 210 modules, 0 changed.
    SAMPLE_HALF = {'smp', 'smpl', 'instr', 'instruments', 'samples', 'set',
                   'ins', 'ip'}

    def _marked_sample_half(name):
        base = os.path.basename(name)
        if '.' not in base:
            return False
        head, tail = base.split('.', 1)
        return head.lower() in SAMPLE_HALF or tail.lower() in SAMPLE_HALF

    def _same_role_as_module(path):
        if not (bool(my_role) and _role_of(path) == my_role):
            return False
        return not (_marked_sample_half(path) and not _marked_sample_half(module))
    # the sample subdirectories these formats use, lowercased for comparison
    for sub in ('instruments', 'samples', 'instr', 'smp'):
        try:
            real = next((x for x in os.listdir(d)
                         if x.lower() == sub and os.path.isdir(os.path.join(d, x))), None)
        except OSError:
            real = None
        if not real:
            continue
        subdir = os.path.join(d, real)
        try:
            names = sorted(os.listdir(subdir))
        except OSError:
            continue
        for f in names:
            fp = os.path.join(subdir, f)
            if not os.path.isfile(fp):
                continue
            try:
                sz = os.path.getsize(fp)
            except OSError:
                continue
            # A DEDICATED SAMPLE DIRECTORY IS BOUNDED BY BYTES, NOT BY COUNT.
            # Those files ARE the instrument set: ZoundMonitor's Samples/ holds
            # 51 of them totalling 343 KB, and the 16-file cap staged the first
            # 16 alphabetically -- so whichever the song actually referenced
            # were often missing and it died with AMIGAMSG_SCOREDEAD. The count
            # cap exists to stop a whole discography being embedded through the
            # SIBLING match below, where a wrong stem can sweep in songs; a
            # subdirectory named Samples/ or Instruments/ is not that risk.
            if not sz or total + sz > max_bytes or len(out) >= SUBDIR_LIMIT:
                continue
            out.append(fp)
            total += sz
    try:
        entries = sorted(os.listdir(d))
    except OSError:
        return out

    # A SHARED SAMPLE BANK, used by every tune in the directory.
    #
    # SynthPack's Dyter-07 set is eight .osp tunes and ONE smp.set; SynthDream's
    # monsterbusiness tunes likewise carry no per-tune smp.* and use the
    # directory's smp.set. Stem matching can never find those: the stem differs
    # by design. So when a sibling's ROLE is a sample role but its stem is not
    # the module's, it is still a candidate -- collected only AFTER the
    # stem-matched and suffixed shapes have had their turn, so a tune with its
    # own samples never picks up the shared one instead.
    # Measured 2026-09-22: SynthPack died with AMIGAMSG_SCOREDEAD holding
    # nothing but a 1950-byte tune, with the bank sitting beside it.
    SAMPLE_ROLES = {'smp', 'smpl', 'instr', 'samples', 'sdata', 'set'}
    # The stems of the OTHER tunes in this directory -- files playing the same
    # role as the module. A sample file carrying one of those stems belongs to
    # that tune, not to this one, and is not a shared bank. Without this,
    # sdr.monsterbusiness 5 collected the six smp.nobuddiesland* banks.
    tune_stems = {stem_of(f) for f in entries
                  if '.' in f and f.split('.', 1)[0].lower() == my_role}
    shared = []
    for f in entries:
        fp = os.path.join(d, f)
        if os.path.abspath(fp) == os.path.abspath(module) or not os.path.isfile(fp):
            continue
        role = f.split('.', 1)[0].lower() if '.' in f else ''
        if role not in SAMPLE_ROLES or role == my_role:
            continue
        if stem_of(f) == stem:
            continue                      # the stem pass below owns this one
        if stem_of(f) in tune_stems:
            continue                      # it is another tune's samples
        shared.append(fp)
    # A FIXED-NAME COMPANION. The Wanted Team Jesper Olsen player requests
    # "WantedTeam.bin" (its shared routine) from the song directory whenever the
    # module's Format byte is negative; the name has nothing to do with the
    # module's. Without it UADE_FILE_COUNT is 0, ExtLoad fails and the disk is silent.
    # Kris Hatlelid's .kh likewise loads its replay code from "songplay" (UADE asks
    # /uade/songplay; without it the disk crashed ILLG at pc 4, measured 2026-11-21).
    # Mirrors the named cases in DEViLBOX src/lib/import/companionResolver.ts.
    fixed = {'.jo': 'wantedteam.bin', '.kh': 'songplay'}.get(os.path.splitext(module)[1].lower())
    if fixed:
        for f in entries:
            fp = os.path.join(d, f)
            if f.lower() == fixed and os.path.isfile(fp) and os.path.getsize(fp):
                out.append(fp)
                total += os.path.getsize(fp)
    for f in entries:
        fp = os.path.join(d, f)
        if os.path.abspath(fp) == os.path.abspath(module) or not os.path.isfile(fp):
            continue
        # THREE SHAPES, not two. Besides the shared-stem sibling, a companion
        # can be the module's own name with ANOTHER extension appended:
        # AudioSculpture ships popelich-brutalo.adsc and its samples as
        # popelich-brutalo.adsc.as, whose stem computes to
        # "popelich-brutalo.adsc" and so never matched the module's
        # "popelich-brutalo". Measured 2026-09-22: the file sat right beside the
        # module and was left out, and the format died with AMIGAMSG_SCOREDEAD.
        suffixed = f.lower().startswith(os.path.basename(module).lower() + '.')
        if not suffixed and (stem_of(f) != stem or _same_role_as_module(fp)):
            continue
        try:
            sz = os.path.getsize(fp)
        except OSError:
            continue
        if not sz or total + sz > max_bytes or len(out) >= limit:
            continue
        out.append(fp)
        total += sz
    if not out:
        # Nothing tune-specific was found, so the shared bank is what this
        # module must mean.
        for fp in shared:
            try:
                sz = os.path.getsize(fp)
            except OSError:
                continue
            if not sz or total + sz > max_bytes or len(out) >= limit:
                continue
            out.append(fp)
            total += sz
    return out


# --- AHX's precomputed waveform table -------------------------------------
#
# AbyssHighestExperience spends ~1420 vblanks (28.4 s on a cycle-exact stock
# A500, 7.0 s on an 020) at EVERY init building 410,760 bytes of waveform and
# filter tables with a per-sample two-pole filter loop on the CPU. In a
# musicdisk that cost is paid again on every switch INTO an AHX song.
#
# The DeliPlayer already knows how not to: at hunk 0x68a it opens
# ENV:EaglePlayer/ahx, reads a 256-byte path out of it, opens THAT, reads
# exactly 410,760 bytes into the table buffer, and on a full read skips all
# generation. That is the EaglePlayer-era disk cache, shipped in 1998; UADE
# never feeds it. The player has no WRITER, so the blob was captured off a
# device run and is checked in at amiga/uade_ahx_waves.bin.
#
# The table is MODULE-INDEPENDENT -- the only module-derived input to the
# generator is byte 3 of the module (THX\0 = v1, THX\1 = v2), and v1 skips
# filter generation entirely. Verified twice: read from the player's code, and
# re-derived on device (10 sampled 64-byte windows across the whole table,
# generated by a 68000 run, match the blob exactly; the previous round also
# captured it from two different modules and got the same md5).
#
# score's dos_open/dos_read reach us as AMIGAMSG_FILESIZE/AMIGAMSG_READ in
# amiga/uade_glue.s's uade_msg_trap, and uade_find_file matches on the
# BASENAME -- so "ENV:EaglePlayer/ahx" resolves to the table entry "ahx".
AHX_PLAYER = 'AbyssHighestExperience'
AHX_WAVES = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                         'amiga', 'uade_ahx_waves.bin')
AHX_WAVES_BYTES = 410760            # the player's own `cmpi.l #410760,d0`
AHX_ENV_NAME = 'ahx'                # basename of ENV:EaglePlayer/ahx
AHX_BLOB_NAME = 'ahxwaves'          # what the ENV stub points at


def module_is_ahx_v2(path):
    """True for a THX\\1 module -- the only kind whose init builds the filter
    tables (the player's `tst.w $7fe(a5) / bne` at 0x85e skips them for v1)."""
    try:
        with open(path, 'rb') as fh:
            head = fh.read(4)
    except OSError:
        return False
    return head[:3] == b'THX' and head[3:4] == b'\x01'


def ahx_waveform_files(songs):
    """The two virtual files that stop AHX recomputing its waveform table, or
    () when no staged song needs them.

    songs: an iterable of (player_name, module_path).
    """
    if not any(p == AHX_PLAYER and module_is_ahx_v2(m) for p, m in songs):
        return ()
    if not os.path.isfile(AHX_WAVES):
        raise SystemExit(
            f"uade_stage: {AHX_WAVES} is missing -- it is the precomputed AHX "
            f"waveform table and an AHX v2 song cannot be staged without it.")
    data = open(AHX_WAVES, 'rb').read()
    if len(data) != AHX_WAVES_BYTES:
        raise SystemExit(
            f"uade_stage: {AHX_WAVES} is {len(data)} bytes, not "
            f"{AHX_WAVES_BYTES}. The player reads exactly {AHX_WAVES_BYTES} "
            f"and only skips generation on a FULL read, so a wrong size "
            f"silently reinstates the 28-second stall.")
    # The stub the player reads first: a path plus the newline its own scan
    # (0x6dc-0x6ea) turns into the NUL terminator.
    return ((AHX_ENV_NAME, AHX_BLOB_NAME.encode() + b'\n'),
            (AHX_BLOB_NAME, data))


def emit_file_table(companions, outdir, module_name='module', extra_files=(),
                    song_files=None):
    """out/current.uadefiles.bin + .i -- the blob and the name/offset/length table.

    score asks by NAME (its dos_fixfilename strips the path), so the table keys
    on the basename and the glue compares case-insensitively.

    `companions` are paths on disk (a DTP_ExtLoad format's second file).
    `extra_files` are (name, bytes) pairs for virtual files that have no path
    of their own -- today, the two entries that hand AHX its precomputed
    waveform table (see ahx_waveform_files).
    `song_files` is {song_index: [paths]} for a PLAYLIST, where several songs
    may each bring a companion and two of them can share a BASENAME -- both
    SynthPack's Dyter-07 set and SynthDream's monsterbusiness tunes ask for
    `smp.set`, and score asks by name alone. So every entry carries the song it
    belongs to and the glue prefers the current song's row; -1 means "any
    song", which is what a single-song build and the AHX waveform files use.
    """
    blob = bytearray()
    entries = []
    named = [(os.path.basename(fp), open(fp, 'rb').read(), -1) for fp in companions]
    named += [(nm, bytes(data), -1) for nm, data in extra_files]
    for song, paths in sorted((song_files or {}).items()):
        for fp in paths:
            named.append((os.path.basename(fp), open(fp, 'rb').read(), song))
    for nm, data, song in named:
        entries.append((nm, len(blob), len(data), song))
        blob += data
        if len(blob) % 2:
            blob += b'\0'          # keep every entry word-aligned
    open(os.path.join(outdir, 'current.uadefiles.bin'), 'wb').write(bytes(blob))
    lines = ["; GENERATED by tools/uade_stage.py -- do not edit.",
             f"UADE_FILE_COUNT         equ     {len(entries)}",
             # FOUR longwords per entry: name, offset, length, song index.
             # The glue strides by this, so a change here reaches it.
             "UADE_FILE_ENTRY_BYTES   equ     16"]
    if entries:
        lines.append("uade_file_table:")
        for i, (nm, off, ln, song) in enumerate(entries):
            lines.append(f"        dc.l    uade_fname_{i},{off},{ln},{song}")
        for i, (nm, off, ln, song) in enumerate(entries):
            safe = nm.replace('"', '')
            lines.append(f'uade_fname_{i}:  dc.b    "{safe}",0')
        lines.append("        even")
    else:
        lines.append("uade_file_table:")
    # score's split_module_name reads the module NAME from $128 and builds the
    # dir/file arrays a DTP_ExtLoad player uses to name its companion. With no
    # name it produces an empty path and ExtLoad fails -- which is exactly how
    # TFMX died ("ExtLoad failed"). The name must be the ORIGINAL one, not
    # out/current.uademod, because the player derives the companion from it
    # (mdat.hbtitle -> smpl.hbtitle).
    # A playlist build has no single module name to publish (score's $128 is
    # cleared for every playlist song), and vasm will not take an empty string
    # literal -- so emit the bare terminator the playlist path used to carry
    # inline in amiga/uade_glue.s.
    safe_mod = module_name.replace('"', '')
    if safe_mod:
        lines.append(f'uade_module_name:  dc.b    "{safe_mod}",0')
    else:
        lines.append('uade_module_name:  dc.b    0')
    lines.append("        even")
    path = os.path.join(outdir, 'current.uadefiles.i')
    tmp = path + f'.tmp.{os.getpid()}'
    open(tmp, 'w').write('\n'.join(lines) + '\n')
    if os.path.exists(path) and open(path).read() == open(tmp).read():
        os.unlink(tmp)
    else:
        os.replace(tmp, path)
    return entries, len(blob)


def epopt_asm(entry, label):
    """vasm lines for one song's eagleplayer options: `dc.w byte count` then
    the NUL-separated `epopt=` values from its eagleplayer.conf line, exactly
    the buffer uadecore's get_info_for_ep() hands back for 'eagleoptions'.
    PTK-Prowiz refuses every module (CHECKERROR, silence) without its
    type:xxx option, so this is not optional for the most common format."""
    opts = [f[len('epopt='):] for f in entry.get('flags', []) if f.startswith('epopt=')]
    assert all('"' not in o for o in opts), opts
    body = ''.join(f'"{o}",0,' for o in opts).rstrip(',')
    size = sum(len(o.encode('latin-1')) + 1 for o in opts)
    out = [f"{label}:  dc.w    {size}"]
    if body:
        out.append(f"        dc.b    {body}")
    out.append("        even")
    return out


def _truncated(s, limit=31):
    """Truncate to LIMIT bytes plus a NUL -- an unbounded string written into a
    fixed-width table on the Amiga side is a buffer overrun waiting to happen,
    and a demo has limited screen width anyway."""
    return (s or '')[:limit]


def check_player(module, player_name, allow_reason, what):
    """Hard error when uade123's content pick differs from the player we link.
    Runs for explicit --player too (SonicArranger linked the wrong player that way);
    a non-empty allow_reason (--allow-player-mismatch REASON) is the only way past."""
    oracle = uade_lookup.cross_check(module, player_name)
    if not oracle or oracle == player_name:
        return
    # A custom module IS its replayer: uade123 names the module file itself as
    # the player (skyfox2.cus), while we call that same thing `custom`.
    if player_name == 'custom' and oracle == os.path.basename(module):
        return
    if allow_reason:
        print(f"uade_stage: {what}: linking {player_name}, uade123 picks {oracle} "
              f"(allowed: {allow_reason})")
        return
    raise SystemExit(
        f"uade_stage: {what}: this build would link {player_name}, but uade123 -- "
        f"which the maker PREVIEWS with -- picks {oracle}. Preview and Amiga would "
        f"play different replayers. Link {oracle}, or pass a reason via "
        f"--allow-player-mismatch (single) / song.allowPlayerMismatch (playlist).")


def stage_songs(songs, outdir, uade_root, vendor_from=None, target_cpu=None,
                 start=0):
    """Stage a PLAYLIST: N modules, deduplicated players, ONE arena.

    The arena is the MAXIMUM over the set of (reloc + module + pool), never the
    sum -- summing is what would make a 20-song playlist impossible. The module
    term is in there because the module is COPIED into the chip arena and its
    size dominates: 3 KB to over 500 KB across the corpus.

    Titles/composers are emitted here (as fixed-width, NUL-terminated strings)
    rather than deferred to the later task that reads them: the table this
    function writes already references uade_song_title_N / uade_song_composer_N
    per entry, so the labels are emitted alongside the table that names them
    instead of leaving those symbols dangling for another file to define later.
    """
    os.makedirs(outdir, exist_ok=True)
    staged, player_order, blob = [], [], bytearray()
    song_files = {}   # song index -> its DTP_ExtLoad companion paths
    any_max = 0
    # An out-of-range start clamps to 0, the FIRST song -- the same rule
    # tools/compile_demo/main.c applies when it parses music.start. The clamp
    # itself is not optional: _uade_cur_song's initial value indexes
    # uade_song_table, and uade_song_entry's `mulu` does not bounds-check, so
    # an unclamped value reads whatever lies past the last table entry instead
    # of failing loudly.
    #
    # This used to clamp to the LAST index (`min(start, len-1)`) while its
    # comment claimed it matched compile_demo, which clamps to 0 -- so
    # `start: 99` on a two-song playlist selected song 1 here and song 0
    # there, and both comments asserted they agreed. Song 0 is the
    # unsurprising answer to an authoring mistake; "start 99 plays the last
    # song" is not.
    start = int(start)
    if songs and 0 <= start < len(songs):
        pass
    else:
        start = 0
    # The device's arena layout is FIXED once, at _music_init, and never
    # moves again -- uade_glue.s's uade_do_switch only changes what gets
    # copied into the two regions, not where they start. So the reloc region
    # (module region immediately above it) must be sized for the WORST
    # player's relocated hunks across the WHOLE playlist, independent of
    # which song's module+pool happens to be biggest: a song with a small
    # player but a huge module cannot borrow headroom from a song with a big
    # player but a tiny module, because both regions are shared by every
    # song in turn. Maxing the single-song formula's TOTAL per song (an
    # earlier version of this function did that) under-counts whenever the
    # song with the biggest reloc is not the same song as the one with the
    # biggest module+pool -- the deployed arena would be too small for the
    # OTHER song's combination, silently, until it played on a device.
    reloc_max, content_max = 0, 0
    arena_table = uade_arena_table.load()

    for i, song in enumerate(songs):
        module = song["filename"]
        entry = uade_lookup.lookup(module, uade_root, song.get("player"))
        player_name = entry["player"]

        # REFUSE a song whose device player disagrees with the PREVIEW player.
        # uade_lookup resolves by eagleplayer.conf prefix; uade123 resolves by
        # CONTENT. When they differ the maker previews one replayer and the
        # Amiga links another -- the RULE 45 parity failure this backend is
        # most likely to ship, and on a playlist it is not even subtle:
        # MEASURED 2026-09-21, snickle.mug resolved here to `Mugician` while
        # uade123 said `MugicianII`, the wrong replayer was linked, and the
        # demo's MAIN LOOP DIED on entry to that song with fatal/dead both 0 --
        # a silent freeze. The disagreement was detectable the whole time;
        # nothing acted on it.
        # Skipped silently when uade123 is absent (cross_check returns None):
        # a host without it cannot answer, and refusing every song then would
        # make the build depend on a tool it does not need.
        check_player(module, player_name, song.get('allowPlayerMismatch'),
                     f'song {i} ({os.path.basename(module)})')

        need, why = min_cpu_for(player_name)
        if need and target_cpu and target_cpu in CPU_ORDER and need in CPU_ORDER \
                and CPU_ORDER.index(target_cpu) < CPU_ORDER.index(need):
            raise SystemExit(
                f"uade_stage: song {i} ({os.path.basename(module)}) needs a "
                f"{need}, but this demo targets a {target_cpu}.\n  {why}")

        # A playlist does not stage per-song DTP_ExtLoad companions (unlike
        # the single-module path's emit_file_table): amiga/uade_glue.s clears
        # $128.w for every playlist build, so a format that asks the host for
        # a second file by name (42 of UADE's 173 players do -- TFMX's
        # smpl.<tune> beside mdat.<tune>, SonixMusicDriver's Instruments/,
        # etc.) gets NOTHING back, silently, on the device. Refuse at build
        # time instead: this catches the common, detectable case -- the
        # companion sits next to the module in Data/Music/, same probe the
        # single-song path already trusts (find_companions). It CANNOT catch
        # a player that needs ExtLoad when its companion is simply missing
        # from Data/Music/ -- that format would need per-song staging support
        # this task does not add, and still fails at runtime the same way a
        # single-song build's missing companion does (_uade_missing_file).
        player_path = os.path.join(uade_root, 'players', player_name)
        if player_name == 'custom':
            shutil.copyfile(module, player_path)
        elif not os.path.exists(player_path) and vendor_from:
            src = os.path.join(vendor_from, player_name)
            if not os.path.exists(src):
                raise SystemExit(f"{player_name}: not in {vendor_from}")
            os.makedirs(os.path.dirname(player_path), exist_ok=True)
            shutil.copyfile(src, player_path)

        # A player we could not find is NOT an ExtLoad rejection. Say so here,
        # before player_needs_extload() is asked about a file that does not
        # exist and answers True from its can't-read fallback -- which is what
        # a clean checkout actually saw: "JochenHippel ... declares
        # DTP_ExtLoad", for a player that declares nothing because it is not
        # there. Same wording as the single-song path's check below.
        if not os.path.isfile(player_path):
            raise SystemExit(
                f"uade_stage: song {i} ({os.path.basename(module)}): "
                f"{player_name} is not vendored at {player_path}. Pass "
                f"--vendor-from <uade players dir> to add it.")

        # STAGE THIS SONG'S COMPANIONS. A DTP_ExtLoad player asks the host
        # for a second file by name at init, and a playlist used to refuse
        # such formats outright because it staged none and cleared score's
        # $128 module-name pointer -- so AudioSculpture, DynamicSynthesizer,
        # SynthDream and SynthPack could only ever be single-song builds.
        #
        # Both halves are fixed now: the song table carries each song's
        # ORIGINAL module name (the glue points $128 at the current one, so
        # split_module_name can derive mdat.x -> smpl.x), and every companion
        # is tagged with its song, because two songs in one playlist can ask
        # for the same BASENAME -- SynthPack's Dyter-07 and SynthDream's
        # monsterbusiness tunes both want `smp.set`.
        if player_needs_extload(player_path):
            comps = find_companions(module)
            # THE COMPANION IS COPIED INTO THE CHIP POOL at init -- score's
            # dos_loadseg / enpp_load_file hand our LOADFILE a destination
            # taken from `chippoint`, and the handler copies the whole file
            # there. So the pool has to be big enough for it, on top of
            # whatever the player allocates.
            # MEASURED 2026-09-23: SynthDream's `smp.nobuddiesland game 2` is
            # 91,506 bytes against an unmeasured player's DEFAULT_POOL of
            # 65,536 -- the copy was refused by the arena bound, score logged
            # "ExtLoad failed" three times and died (AMIGAMSG_SCOREDEAD), and
            # song 99 was silent. Before the bound existed it scribbled past
            # the arena instead, which is the same defect with no message.
            if not comps:
                raise SystemExit(
                    f"uade_stage: song {i} ({os.path.basename(module)}) uses "
                    f"{player_name}, which declares DTP_ExtLoad -- it asks the "
                    f"host for a companion file by name at init time, and none "
                    f"was found beside the module. Put the samples next to it "
                    f"(see find_companions for the four shapes it knows), or "
                    f"drop the song from the playlist.")
            song_files[i] = comps

        # Refuse `custom` in a playlist. A "custom" module IS its own player --
        # eagleplayer.conf carries no player binary for it at all -- so the
        # switch path has nothing to hand contplayer's $108 (player image).
        # MEASURED, not assumed: a 40-format disk switched cleanly through
        # AM-Composer, ArtOfNoise-4V, BenDaglish and BenDaglish-SID and then
        # the MAIN LOOP STOPPED on song 5, `custom` (skyfox.cus), with the
        # player name still reading the previous song's -- contplayer never
        # completed. fatal and dead both stayed 0, so nothing reported it: the
        # demo simply froze with the music still playing.
        # Single-song `custom` builds are unaffected and are not touched here.
        if player_name == 'custom':
            raise SystemExit(
                f"uade_stage: song {i} ({os.path.basename(module)}) resolves "
                f"to the `custom` pseudo-player, which has no player binary "
                f"-- a custom module carries its own replayer. A playlist "
                f"switch needs a player image to relocate, so this FREEZES "
                f"the demo's main loop on entry (measured 2026-09-21). Build "
                f"it as a single-song project, or drop it from the playlist.")

        if player_name not in player_order:
            player_order.append(player_name)

        reloc = (relocated_size(player_path) + 1023) & ~1023
        mod_bytes = os.path.getsize(module)
        measured = arena_table.get(player_name)
        pool = with_margin(measured['pool_hw']) if measured else DEFAULT_POOL
        anyb = with_margin(measured['any_hw']) if measured else DEFAULT_ANY
        if not measured:
            print(f"uade_stage: song {i} ({player_name}) is UNMEASURED -- "
                  f"using defaults, size unknown")

        # Diagnostic only (see 'arena_bytes' below): what THIS song alone
        # would need if it had the arena to itself.
        # A module the player LoadSeg()s is charged for TWICE over, and the
        # second charge includes its BSS hunks -- see loadseg_bytes.
        loadseg = loadseg_bytes(module)
        if loadseg:
            print(f"uade_stage: song {i} ({os.path.basename(module)}) is a "
                  f"hunkexe its player LoadSegs: +{loadseg} chip")
        # Every companion this song brings is copied into the chip pool too.
        comp_bytes = sum((os.path.getsize(c) + 15) & ~15
                         for c in song_files.get(i, ()))
        if comp_bytes:
            print(f"uade_stage: song {i} ({os.path.basename(module)}) "
                  f"companions: +{comp_bytes} chip")
        loadseg += comp_bytes
        song_arena = (ARENA_HEAD + reloc + RELOC_SLACK + MOD_SLACK
                      + mod_bytes + loadseg + POOL_GAP + pool)
        reloc_max = max(reloc_max, reloc)
        content_max = max(content_max, mod_bytes + loadseg + POOL_GAP + pool)
        any_max = max(any_max, anyb)

        offset = len(blob)
        blob += open(module, 'rb').read()
        staged.append({
            'index': i, 'filename': module, 'player': player_name,
            'player_index': player_order.index(player_name),
            'entry': entry,
            'module_offset': offset, 'module_bytes': mod_bytes,
            'reloc_bytes': reloc, 'subsong': song.get('subsong', 0),
            'title': song.get('title', ''),
            'composer': song.get('composer', ''),
            # Diagnostic/test fields: what a STANDALONE arena for this one
            # song would need (pool included). Not consumed by the device --
            # exposed so a caller (or a test) can compare the MAX this
            # function picks against the SUM of what N separate arenas would
            # have cost, without re-deriving the arena formula itself.
            'pool_bytes': pool,
            'arena_bytes': song_arena,
        })

    # ARENA_HEAD + the WORST reloc across the set + slack + the WORST
    # module+pool COMBINATION across the set (not each one's own individual
    # max in isolation -- content_max already pairs a song's module with its
    # OWN pool). This is the address-layout formula amiga/uade_glue.s's
    # _uade_init_super mirrors exactly (UADE_RELOC_BYTES_MAX term).
    arena_max = ARENA_HEAD + reloc_max + RELOC_SLACK + MOD_SLACK + content_max

    with open(os.path.join(outdir, 'current.uademods.bin'), 'wb') as fh:
        fh.write(bytes(blob))
    # The virtual file table. A playlist stages no per-song DTP_ExtLoad
    # companions (rejected above), so the only entries are AHX's precomputed
    # waveform table -- and none at all when the set has no AHX v2 song, which
    # is the empty table the glue used to hardcode.
    waves = ahx_waveform_files([(s['player'], s['filename']) for s in staged])
    # module_name stays empty: a playlist has no single module name, and the
    # glue points $128 at the CURRENT song's name from the song table.
    emit_file_table([], outdir, module_name='', extra_files=waves,
                    song_files=song_files)
    if waves:
        print(f"uade_stage: AHX waveform table baked in "
              f"({AHX_WAVES_BYTES} bytes) -- the player loads it instead of "
              f"computing it on every init")
    with open(os.path.join(outdir, 'uade_sizes.i'), 'w') as fh:
        fh.write("; GENERATED by tools/uade_stage.py -- do not edit.\n")
        fh.write(f"UADE_SONG_COUNT         equ     {len(staged)}\n")
        fh.write(f"UADE_PLAYER_COUNT       equ     {len(player_order)}\n")
        fh.write(f"UADE_ARENA_BYTES_MAX    equ     {arena_max}\n")
        fh.write(f"UADE_RELOC_BYTES_MAX    equ     {reloc_max}\n")
        fh.write(f"UADE_ANY_BYTES          equ     {any_max}\n")
        fh.write(f"UADE_START_SONG         equ     {start}\n")
        fh.write(f"UADE_SONG_ENTRY_BYTES   equ     24\n")
        # The table the device indexes. SIX longwords per song, in the order
        # uade_song_entry returns them: module address, module length, player
        # image, title pointer, composer pointer, and the song's ORIGINAL
        # module name.
        #
        # That last one is what makes DTP_ExtLoad work in a playlist. score's
        # split_module_name reads $128 and builds the dir/file arrays a player
        # derives its companion's name from (mdat.hbtitle -> smpl.hbtitle).
        # A playlist used to clear $128 outright, so an ExtLoad format could
        # not be in one at all -- it asked for a companion and got nothing.
        fh.write("\nuade_song_table:\n")
        for sng in staged:
            fh.write(f"        dc.l    _uade_mods_src+{sng['module_offset']}\n")
            fh.write(f"        dc.l    {sng['module_bytes']}\n")
            fh.write(f"        dc.l    uade_player_{sng['player_index']}\n")
            fh.write(f"        dc.l    uade_song_title_{sng['index']}\n")
            fh.write(f"        dc.l    uade_song_composer_{sng['index']}\n")
            fh.write(f"        dc.l    uade_song_name_{sng['index']}\n")
        for n, name in enumerate(player_order):
            fh.write(f"uade_player_{n}:  incbin \"current.uadeplayer{n}\"\n")
            fh.write("        even\n")
            shutil.copyfile(os.path.join(uade_root, 'players', name),
                            os.path.join(outdir, f'current.uadeplayer{n}'))
        # Titles/composers: truncated to 31 chars + NUL, emitted now rather
        # than left for a later task -- the table above already references
        # these labels by name.
        for sng in staged:
            title = _truncated(sng['title']).replace('"', '')
            composer = _truncated(sng['composer']).replace('"', '')
            fh.write(f'uade_song_title_{sng["index"]}:  dc.b    "{title}",0\n')
            fh.write("        even\n")
            fh.write(f'uade_song_composer_{sng["index"]}:  dc.b    "{composer}",0\n')
            fh.write("        even\n")
            # The ORIGINAL basename, not out/current.uademod: the player
            # derives its companion's name from this one.
            modname = os.path.basename(sng['filename']).replace('"', '')
            fh.write(f'uade_song_name_{sng["index"]}:  dc.b    "{modname}",0\n')
            fh.write("        even\n")
        # Per-song eagleplayer options, indexed by _uade_cur_song.
        fh.write("uade_epopt_table:\n")
        for sng in staged:
            fh.write(f"        dc.l    uade_epopt_{sng['index']}\n")
        for sng in staged:
            fh.write('\n'.join(epopt_asm(sng['entry'], f"uade_epopt_{sng['index']}")) + '\n')
    print(f"uade_stage: {len(staged)} songs, {len(player_order)} players, "
          f"arena {arena_max} chip / {any_max} any")
    return staged


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--module', default=None)
    ap.add_argument('--playlist', default=None,
                    help='a project JSON whose music.songs is staged as one '
                         'arena via stage_songs(), instead of a single '
                         '--module. Mutually exclusive with --module.')
    ap.add_argument('--player', default=None)
    ap.add_argument('--allow-player-mismatch', metavar='REASON', default=None)
    ap.add_argument('--uade-root', default=uade_lookup.DEFAULT_ROOT)
    ap.add_argument('--outdir', default='out')
    ap.add_argument('--companion-slot-bytes', type=int, default=0,
                    help='DEViLBOX ADF: charge the pool for a companion of this size, not the staged one')
    ap.add_argument('--pool-bytes', type=int, default=None,
                    help='override the measured pool size (bytes)')
    ap.add_argument('--target-cpu', default=None,
                    help="the project's target.cpu, so a format that "
                         'needs an 020 is refused here rather than '
                         'gurued on the device')
    ap.add_argument('--any-bytes', type=int, default=None,
                    help='override the measured MEMF_ANY size (bytes)')
    ap.add_argument('--vendor-from', default=None,
                    help='copy the player in from this UADE players/ directory '
                         'if it is not vendored yet. Only the players a demo '
                         'actually embeds are tracked, so adding one is '
                         'deliberate rather than automatic.')
    args = ap.parse_args()

    if not args.playlist and not args.module:
        raise SystemExit("uade_stage: pass --module <file> or --playlist "
                          "<demo.json>")

    if args.playlist:
        # Playlist path: music.songs from the project JSON, staged as ONE
        # arena by stage_songs(). When --playlist is absent everything below
        # runs exactly as before this argument existed -- that is what keeps
        # the single-song path (40 working formats) intact.
        with open(args.playlist) as fh:
            project = json.load(fh)
        music = project.get('music') or {}
        songs = music.get('songs') or []
        if not songs:
            raise SystemExit(
                f"uade_stage: {args.playlist}: music.songs is empty")
        # music.start -- clamped to 0 inside stage_songs() when it is out of
        # range, the same rule compile_demo applies. A non-INTEGER value is a
        # different thing: a project-file error, and it stops the build rather
        # than falling back silently.
        try:
            start = int(music.get('start', 0) or 0)
        except (TypeError, ValueError):
            raise SystemExit(
                f"uade_stage: {args.playlist}: music.start must be an "
                f"integer (got {music.get('start')!r})")
        # A song's "filename" resolves on the PATH'S SHAPE, never on what
        # happens to be on disk:
        #
        #   absolute            -> as-is
        #   has a directory part-> as-is, relative to the repo (the CWD every
        #                          caller of this tool already uses)
        #   bare basename       -> Data/Music/<name>, unconditionally
        #
        # It used to branch on `os.path.exists(fn)` against the CWD at
        # invocation time, so a bare name present in BOTH the working
        # directory and Data/Music silently took the working-directory copy,
        # with no warning and no way to tell from the build output which one
        # was staged. A resolution rule that reads the filesystem gives
        # different answers in different working directories for the same
        # project file.
        #
        # The join has to stay conditional on there being no directory part:
        # an unconditional join turns an already-qualified
        # `Data/Music/foo.ahx` into `Data/Music/Data/Music/foo.ahx`.
        #
        # (The old comment claimed this mirrored amiga/uade.mk's
        # `UADE_MUSIC ?= Data/Music/$(LSP_MUSIC_FILE)`. It did not -- that is
        # an unconditional make default with no existence check. NOW it does.)
        resolved = []
        for song in songs:
            song = dict(song)
            fn = song['filename']
            if not os.path.isabs(fn) and not os.path.dirname(fn):
                fn = os.path.join('Data', 'Music', fn)
            song['filename'] = fn
            resolved.append(song)
        stage_songs(resolved, args.outdir, args.uade_root,
                    vendor_from=args.vendor_from, target_cpu=args.target_cpu,
                    start=start)
        return

    entry = uade_lookup.lookup(args.module, args.uade_root, args.player)
    check_player(args.module, entry['player'], args.allow_player_mismatch, os.path.basename(args.module))
    player = os.path.join(args.uade_root, 'players', entry['player'])

    # `custom` (Delitracker Custom) has NO player binary, and none is missing:
    # the module IS its own replayer, self-contained 68k code. eagleplayer.conf
    # lists it as a format, but there is nothing to load beside it -- uade123
    # reports the MODULE's own filename as the playerfname, and neither UADE's
    # own tree nor DEViLBOX's 177 binaries carry a file called `custom`.
    # Looking for one produced "custom: not in <players dir>" and read as a
    # missing vendor file. Stage the module as the player image instead.
    if entry['player'] == 'custom':
        os.makedirs(os.path.dirname(player), exist_ok=True)
        shutil.copyfile(args.module, player)
        print(f"uade_stage: custom is self-contained -- the module IS the "
              f"player ({os.path.getsize(player)} B)")

    if not os.path.exists(player) and args.vendor_from:
        src = os.path.join(args.vendor_from, entry['player'])
        if not os.path.exists(src):
            raise SystemExit(f"{entry['player']}: not in {args.vendor_from}")
        os.makedirs(os.path.dirname(player), exist_ok=True)
        shutil.copyfile(src, player)
        print(f"uade_stage: vendored {entry['player']} "
              f"({os.path.getsize(player)} B) from {args.vendor_from}")
    if not os.path.exists(player):
        raise SystemExit(
            f"{entry['player']}: not vendored at {player}. Pass --vendor-from "
            f"<uade players dir> to add it.")

    os.makedirs(args.outdir, exist_ok=True)
    mod_out = os.path.join(args.outdir, 'current.uademod')
    ply_out = os.path.join(args.outdir, 'current.uadeplayer')
    shutil.copyfile(args.module, mod_out)
    shutil.copyfile(player, ply_out)

    companions = find_companions(args.module)
    # A single-song AHX demo pays the same 28.4-second table build at BOOT that
    # a musicdisk pays on every switch, and the seam is identical -- so the
    # waveform entries go on both paths, keyed on the player, not on the build
    # mode. For every other format this adds nothing to the table.
    waves = ahx_waveform_files([(entry['player'], args.module)])
    entries, blob_bytes = emit_file_table(
        companions, args.outdir, os.path.basename(args.module),
        extra_files=waves)
    if waves:
        print(f"uade_stage: AHX waveform table baked in "
              f"({AHX_WAVES_BYTES} bytes) -- the player loads it instead of "
              f"computing it on every init")

    mod_bytes = os.path.getsize(mod_out)
    reloc = relocated_size(player)
    # Round the reloc area up to a 1 KB boundary so a small player edit does not
    # silently move everything that follows it in the arena.
    reloc_rounded = (reloc + 1023) & ~1023

    # --- arena sizes, measured per player -------------------------------
    # amiga/uade_arena_sizes.tsv holds each player's runtime high-water and the
    # module it was measured with (tools/uade_arena_table.py, from a device
    # sweep). Subtract the fixed head of the arena for THAT module and what is
    # left is the pool the replayer actually used; add it back for THIS one.
    #
    # This is what stops a SidMon tune carrying AHX's 412 KB MEMF_ANY arena:
    # 27 of the 31 measured formats allocate none at all, and on a machine with
    # no fast RAM that arena is the difference between fitting and not.
    # --- will this format run on the target's CPU? ----------------------
    # UADE emulates an 020, so a player can depend on 020 behaviour and nobody
    # upstream notices. On a 68000 that is a guru at boot. Refuse here, where
    # the player is known and the message can name both.
    need, why = min_cpu_for(entry['player'])
    if need and args.target_cpu:
        have, want = args.target_cpu, need
        if (have in CPU_ORDER and want in CPU_ORDER
                and CPU_ORDER.index(have) < CPU_ORDER.index(want)):
            raise SystemExit(
                f"uade_stage: {entry['player']} needs a {want}, but this demo "
                f"targets a {have}.\n"
                f"  {why}\n"
                f"  Set \"cpu\": \"{want}\" in the project's target, or pick a "
                f"format that runs on a {have}.")

    measured = uade_arena_table.load().get(entry['player'])
    pool_bytes, any_bytes = args.pool_bytes, args.any_bytes
    why = 'explicit'
    if pool_bytes is None or any_bytes is None:
        if measured:
            if pool_bytes is None:
                pool_bytes = with_margin(measured['pool_hw'])
            if any_bytes is None:
                any_bytes = with_margin(measured['any_hw'])
            why = f"measured ({measured['module']})"
        else:
            if pool_bytes is None:
                pool_bytes = DEFAULT_POOL
            if any_bytes is None:
                any_bytes = DEFAULT_ANY
            why = 'UNMEASURED -- defaults'
    # A module its player LoadSeg()s is charged to the chip pool twice over,
    # BSS hunks included -- see loadseg_bytes. A player MEASURED with such a
    # module already carries it in pool_hw, so this double-counts there; that
    # costs BSS, which is free, and the alternative is an arena that is right
    # only for the module the sweep happened to measure with.
    loadseg = loadseg_bytes(args.module)
    if loadseg:
        pool_bytes += loadseg
        why += f" +{loadseg} LoadSeg"
    comp_bytes = sum((os.path.getsize(c) + 15) & ~15 for c in companions)
    if companions and args.companion_slot_bytes:
        comp_bytes = (args.companion_slot_bytes + 15) & ~15
    if comp_bytes:
        pool_bytes += comp_bytes
        why += f" +{comp_bytes} companions"
    args.pool_bytes, args.any_bytes = pool_bytes, any_bytes

    inc = os.path.join(args.outdir, 'uade_sizes.i')
    tmp = inc + f'.tmp.{os.getpid()}'
    with open(tmp, 'w') as fh:
        fh.write(
            "; GENERATED by tools/uade_stage.py -- do not edit.\n"
            f"; module {os.path.basename(args.module)} -> player {entry['player']}\n"
            f"UADE_MODULE_BYTES       equ     {mod_bytes}\n"
            f"UADE_RELOC_BYTES        equ     {reloc_rounded}\n"
            f"UADE_POOL_BYTES         equ     {args.pool_bytes}\n"
            f"UADE_ANY_BYTES          equ     {args.any_bytes}\n"
            "uade_epopt_table:  dc.l    uade_epopt_0\n"
            + '\n'.join(epopt_asm(entry, 'uade_epopt_0')) + '\n')
    # Content-compare so an unchanged stage does not retrigger the link.
    if os.path.exists(inc) and open(inc).read() == open(tmp).read():
        os.unlink(tmp)
    else:
        os.replace(tmp, inc)

    comp = (f", {len(entries)} companion file(s) {blob_bytes} B"
            if entries else "")
    print(f"uade_stage: {os.path.basename(args.module)} ({mod_bytes} B) + "
          f"{entry['player']} (reloc {reloc} -> {reloc_rounded} B), "
          f"pool {args.pool_bytes} chip / {args.any_bytes} any "
          f"[{why}]{comp}")


if __name__ == '__main__':
    main()
