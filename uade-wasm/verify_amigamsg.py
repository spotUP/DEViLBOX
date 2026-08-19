#!/usr/bin/env python3
"""verify_amigamsg.py — check the 68k score and the host agree on message ids.

The score (third-party/uade-3.05/amigasrc/score/score.s) sends AMIGAMSG_* ids to
the host as bare numbers, hardcoded as `equ` constants.  The host decodes them
through `enum amigamsg` in src/include/amigamsg.h.  Nothing in the compiler
links the two, so an enumerator inserted anywhere in the middle of the enum
silently re-numbers every message after it and the two sides start disagreeing
about what a message means.

This script parses both files and fails if any shared name maps to a different
number.  Run from build.sh (and CI) before anything is compiled.
"""

import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
UADE_SRC = os.path.join(HERE, '..', 'third-party', 'uade-3.05')
HEADER = os.path.join(UADE_SRC, 'src', 'include', 'amigamsg.h')
SCORE = os.path.join(UADE_SRC, 'amigasrc', 'score', 'score.s')

ENUM_RE = re.compile(r'enum\s+amigamsg\s*\{(.*?)\}\s*;', re.S)
EQU_RE = re.compile(r'^\s*(AMIGAMSG_\w+)\s+equ\s+(\d+)\s*$', re.M | re.I)


def strip_comments(text):
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    return re.sub(r'//[^\n]*', '', text)


def parse_header(path):
    """Return {name: value} for `enum amigamsg`, honouring explicit `= n`."""
    with open(path, encoding='latin-1') as fh:
        body = ENUM_RE.search(strip_comments(fh.read()))
    if not body:
        sys.exit('verify_amigamsg: could not find `enum amigamsg` in %s' % path)

    values, next_value = {}, 0
    for entry in body.group(1).split(','):
        entry = entry.strip()
        if not entry:
            continue
        if '=' in entry:
            name, explicit = (part.strip() for part in entry.split('=', 1))
            next_value = int(explicit, 0)
        else:
            name = entry
        values[name] = next_value
        next_value += 1
    return values


def parse_score(path):
    """Return {name: value} for the score's AMIGAMSG_* equ constants."""
    with open(path, encoding='latin-1') as fh:
        return {m.group(1): int(m.group(2)) for m in EQU_RE.finditer(fh.read())}


def main():
    header = parse_header(HEADER)
    score = parse_score(SCORE)

    if not score:
        sys.exit('verify_amigamsg: no AMIGAMSG_* equ constants found in %s' % SCORE)

    problems = []
    for name, score_value in sorted(score.items()):
        if name not in header:
            problems.append('%s = %d in score.s but absent from amigamsg.h'
                            % (name, score_value))
        elif header[name] != score_value:
            problems.append('%s is %d in score.s but %d in amigamsg.h'
                            % (name, score_value, header[name]))

    if problems:
        print('verify_amigamsg: 68k score and host disagree on message ids:',
              file=sys.stderr)
        for problem in problems:
            print('  - %s' % problem, file=sys.stderr)
        return 1

    print('verify_amigamsg: %d shared message ids agree' % len(score))
    return 0


if __name__ == '__main__':
    sys.exit(main())
