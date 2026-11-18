#!/usr/bin/env python3
"""Resolve a module filename to the UADE EaglePlayer that plays it.

`eagleplayer.conf` is UADE's format table: one line per entry,

    <PlayerName>\tprefixes=<csv>[\t<flag> ...]

179 entries, and a player may appear on several lines with different prefixes
and options (PTK-Prowiz does). Amiga module naming puts the format either in
front of the name (`AHX.Cruisin`, `mdat.jaguar`) or behind it (`cruisin.ahx`),
so both are matched.

Flags that matter to us:

  speed_hack   UADE sets AMIGAMSG_TIME_CRITICAL for these and lets its emulated
               CPU run unbounded, i.e. its emulation needs more than real-time
               CPU to keep up. That is NOT the same as "impossible on real
               hardware" -- PreTracker, Musicline, Oktalyzer and EMS-6 are Amiga
               programs that ran on Amigas. On a stock A500 expect them to
               struggle; on an 020/030 they may be fine. Untested either way, so
               this is a WARNING, not a refusal: the owner decides.
  ignore_player_check
               Trust the prefix; score's own DTP_Check is skipped.

Usage:
    uade_lookup.py <module> [--uade-root DIR] [--player NAME] [--json]

Prints the player name on stdout. Exits non-zero with a reason on stderr if the
format is unknown, ambiguous, or refused.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys

DEFAULT_ROOT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'amiga', 'vendor', 'uade-3.05')

REFUSED_FLAG = 'speed_hack'


def parse_conf(path):
    """-> (entries, prefix_map). entries: list of dicts. prefix_map: prefix -> entry."""
    entries = []
    prefix_map = {}
    with open(path, encoding='latin-1') as fh:
        for lineno, raw in enumerate(fh, 1):
            line = raw.rstrip('\n')
            if not line.strip() or line.lstrip().startswith('#'):
                continue
            fields = [f for f in line.replace('\t', ' ').split(' ') if f]
            if len(fields) < 2 or not fields[1].startswith('prefixes='):
                continue
            entry = {
                'player': fields[0],
                'prefixes': [p for p in fields[1][len('prefixes='):].split(',') if p],
                'flags': fields[2:],
                'line': lineno,
            }
            entries.append(entry)
            for p in entry['prefixes']:
                key = p.lower()
                # A prefix claimed by two DIFFERENT players is a real conflict;
                # the same player on several lines (PTK-Prowiz) is not.
                if key in prefix_map and prefix_map[key]['player'] != entry['player']:
                    raise SystemExit(
                        f"{path}:{lineno}: prefix {p!r} claimed by both "
                        f"{prefix_map[key]['player']} and {entry['player']}")
                prefix_map.setdefault(key, entry)
    return entries, prefix_map


def candidates(basename):
    """Prefix candidates for a module filename, best first."""
    out = []
    if '.' in basename:
        head, tail = basename.split('.', 1)
        out.append(head.lower())                    # AHX.Cruisin
        out.append(basename.rsplit('.', 1)[1].lower())  # cruisin.ahx
    return [c for c in out if c]


def lookup(module, root=DEFAULT_ROOT, override=None):
    conf = os.path.join(root, 'eagleplayer.conf')
    entries, prefix_map = parse_conf(conf)
    base = os.path.basename(module)

    if override:
        for e in entries:
            if e['player'] == override:
                return e
        raise SystemExit(f"--player {override!r}: not in {conf}")

    for cand in candidates(base):
        if cand in prefix_map:
            return prefix_map[cand]

    # No prefix in the name. Plenty of real modules are like that -- ripped
    # tunes are often just "Jammer" or the composer's name -- and UADE handles
    # them by looking at the CONTENT. Rather than reimplement that detection,
    # ask uade123, which is the same binary the maker previews with, and map its
    # answer back onto a conf entry.
    detected = cross_check(module, None)
    if detected:
        for e in entries:
            if e['player'] == detected:
                return e

    raise SystemExit(
        f"{base}: no eagleplayer.conf prefix matches (tried "
        f"{', '.join(candidates(base)) or 'nothing -- no dot in the name'})"
        f"{' and uade123 did not recognise the content either' if shutil.which('uade123') or os.path.exists('/opt/homebrew/bin/uade123') else ' and uade123 is not installed to detect by content'}. "
        f"Pass music.uade.player to choose explicitly.")


def uade123_info(module):
    """Run `uade123 -g <module>` once and return what it self-reports, or
    None if uade123 is not installed or the run fails / recognises nothing.

    Keys: player (basename of playerfname -- the vendored binary's actual
    filename, e.g. "PTK-Prowiz"), playername (uade123's own human-readable
    name for that player/format, e.g. "Protracker and family", "AHX v2"),
    formatname (often empty; present for some formats, e.g. "type:
    Protracker"). playername is what a human should be shown -- "PTK-Prowiz"
    is one binary covering ProTracker and the whole ProWizard family of
    ripped/packed variants, accurate but meaningless to a reader (the owner's
    reaction to it was to doubt the tool). `player` stays available because
    it is what actually gets vendored into amiga/vendor/uade-3.05/players/,
    and the owner needs that exact filename when one is missing.
    """
    exe = shutil.which('uade123') or '/opt/homebrew/bin/uade123'
    if not os.path.exists(exe):
        return None
    try:
        out = subprocess.run([exe, '-g', module], capture_output=True,
                             text=True, timeout=30).stdout
    except (subprocess.SubprocessError, OSError):
        return None
    info = {'player': None, 'playername': None, 'formatname': None}
    for line in out.splitlines():
        if line.startswith('playerfname:'):
            info['player'] = os.path.basename(line.split(':', 1)[1].strip())
        elif line.startswith('playername:'):
            name = line.split(':', 1)[1].strip()
            if name:
                info['playername'] = name
        elif line.startswith('formatname:'):
            name = line.split(':', 1)[1].strip()
            if name:
                info['formatname'] = name
    return info if info['player'] else None


def cross_check(module, player):
    """uade123 -g prints the player it would pick. A disagreement is a build error.

    The preview renders with uade123 and the device links whatever we resolve
    here; if the two disagree the maker plays one thing and the Amiga another,
    which is the RULE 45 parity failure this backend is most likely to ship.

    Back-compat wrapper over uade123_info() for the callers (uade_stage.py,
    uade_format_sweep.py) that only want the player basename to compare
    against their own resolution -- unchanged behaviour, unchanged signature.
    """
    info = uade123_info(module)
    return info['player'] if info else None


def main():
    ap = argparse.ArgumentParser()
    # --list-prefixes has no module, so `module` cannot be required. Checked
    # explicitly below rather than made optional-looking to every other caller.
    ap.add_argument('module', nargs='?')
    ap.add_argument('--list-prefixes', action='store_true',
                    help='print every extension eagleplayer.conf claims, as a '
                         'JSON array, and exit. The maker uses this to decide '
                         'which music files it may accept for upload -- there '
                         'must be ONE parser of this conf, and it is here.')
    ap.add_argument('--uade-root', default=DEFAULT_ROOT)
    ap.add_argument('--player', default=None,
                    help='override the prefix lookup (music.uade.player)')
    ap.add_argument('--json', action='store_true')
    ap.add_argument('--no-cross-check', action='store_true')
    args = ap.parse_args()

    if args.list_prefixes:
        _entries, prefix_map = parse_conf(
            os.path.join(args.uade_root, 'eagleplayer.conf'))
        print(json.dumps(sorted('.' + p for p in prefix_map)))
        return

    if not args.module:
        ap.error('a module is required unless --list-prefixes is given')

    entry = lookup(args.module, args.uade_root, args.player)

    if REFUSED_FLAG in entry['flags']:
        print(f"warning: {entry['player']} is marked {REFUSED_FLAG} in "
              f"eagleplayer.conf -- UADE runs its emulated CPU unbounded for "
              f"this format, so it needs more than real-time CPU under "
              f"emulation. On a stock A500 it may not keep up; on an 020/030 it "
              f"may be fine. Nobody has measured it on hardware yet.",
              file=sys.stderr)

    binary = os.path.join(args.uade_root, 'players', entry['player'])
    if not os.path.exists(binary):
        raise SystemExit(
            f"{entry['player']}: eagleplayer.conf names it but "
            f"{binary} is not vendored. Only the players a demo actually "
            f"embeds are tracked -- copy this one in.")

    # Reused below for the JSON output's `playername` -- one uade123 -g run
    # serves both the disagreement check and the human-readable name, so
    # enriching the JSON costs nothing beyond what this tool already paid.
    info = None
    if not args.no_cross_check and not args.player:
        info = uade123_info(args.module)
        theirs = info['player'] if info else None
        if theirs and theirs != entry['player']:
            raise SystemExit(
                f"lookup disagreement: this tool picked {entry['player']}, "
                f"uade123 picked {theirs}. The maker previews with uade123 and "
                f"the device links what this tool picks, so shipping the "
                f"disagreement means preview and device play different players.")

    if args.json:
        # A non-mutating merge -- `entry` may be the SAME dict object cached
        # in eagleplayer.conf's prefix_map (several prefixes share one conf
        # line), so writing into it here would leak this module's specific
        # uade123 answer onto every other prefix that resolves to the same
        # player within a caller that keeps calling lookup() in one process
        # (uade_stage.py, staging a playlist, does exactly that).
        output = dict(entry)
        if info:
            if info.get('playername'):
                output['playername'] = info['playername']
            if info.get('formatname'):
                output['formatname'] = info['formatname']
        print(json.dumps(output))
    else:
        print(entry['player'])


if __name__ == '__main__':
    main()
