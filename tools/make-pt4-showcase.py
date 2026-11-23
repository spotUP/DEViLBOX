#!/usr/bin/env python3
"""Build a 32-channel ProTracker 4.1 showcase from Hyperbased (Firefox): the echo remix plus 24 more channels.

  python3 tools/make-pt4-showcase.py SOURCE.mod OUT.mod

Reuses tools/make-pt4-remix.py (channels 1-8, the effect plan, the PT4X echo copies, the DYN envelope) and adds
the layers in LAYERS on channels 9-32. Everything is built from the song's own samples plus five synthesized
8-bit waves. It prints a feature table: where each effect and each layer first sounds.

Format limits that shape the song (third-party/protracker4/docs/PT41_FORMAT.md):
- A wide module (9..32 channels) ignores every 8xy sub-effect. The 8xy cells of the echo remix are still in the
  file but do nothing here; they are audible in the 8CHN echo remix only.
- A wide module has no pan command: channel k is left when k & 3 is 0 or 3, else right. Stereo spread is the
  choice of channel only.
- A wide module always plays the extended period range (57..1712), so the high and low notes here are real.
"""
import importlib.util
import os
import struct
import sys

_spec = importlib.util.spec_from_file_location('pt4remix', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'make-pt4-remix.py'))
remix = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(remix)

NCH = 32
PT = [856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453, 428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
      214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113]
TONAL = ('base', 'longbase', 'lead', 'lead2', 'lead 3', 'lead 4', 'accdur', 'accmol', 'acc3', 'acc4')   # get a finetune +1 copy
# Lead sample -> semitones to add so the 32-byte saw sounds one octave above it (measured sample tunings).
LEAD_UP = {'lead 3': 12, 'lead 4': 12, 'lead2': 0, 'lead': 8}
SEQ_STEPS = (0, 12, 7, 12, 0, 12, 19, 12)                         # root, octave, fifth: fits major and minor
LAYERS = [  # channels (1-based), side, what
    ('1-4', 'L R R L', 'source song, untouched'),
    ('5-8', 'R L L R', 'echo 1: 3 rows late, half volume, other side; carries the effect plan and the DYN orch-hit'),
    ('9-12', 'L R R L', 'echo 2: 6 rows late, same volume as echo 1, source side'),
    ('13-16', 'R L L R', 'double: the source on the other side, tonal samples on finetune +1 copies (chorus)'),
    ('17', 'L', 'pad A: pulse wave on the bass root, arpeggio 07C on every row'),
    ('18', 'R', 'pad B: saw a fifth above the root, vibrato 4xy / tremolo 7xy by section'),
    ('19', 'R', 'bass double: sub wave in unison with longbase'),
    ('20', 'L', 'gate pad: DYN envelope with dynamic loop (attack, then a 4-chunk pulse that repeats)'),
    ('21-22', 'L R', "sequencer ping-pong on 'another drop': Cxx, ECx, 9xx, EDx in turn"),
    ('23-24', 'R L', 'lead doubles one octave up on the saw (extended period range)'),
    ('25', 'L', 'sub-kick: bassdrum one octave down under every kick'),
    ('26', 'R', 'snare fill every 4th position: Cxx build, then E9x rolls'),
    ('27-28', 'R L', 'tom fill every 8th position: wood / lightwood with E1x / E2x'),
    ('29-30', 'L R', 'sequencer echo: 3 rows late, other side'),
    ('31', 'R', 'riser: saw with 1xx into every 8th position'),
    ('32', 'L', 'glissando riser (E31 + 3xx) mid-phrase; reversed orch-hit swell into every 8th position'),
]


def per(idx):
    """Period of note index idx (0 = C-1); below 0 and above 35 is the extended range of a wide module."""
    idx = max(-12, min(46, idx))
    return PT[idx + 12] * 2 if idx < 0 else PT[idx] if idx < 36 else round(PT[idx - 12] / 2)


def note_idx(period):
    return min(range(36), key=lambda i: abs(PT[i] - period))


def s8(values):
    return bytes(int(max(-128, min(127, v))) & 255 for v in values)


def layers(L):
    """Fill echo[8..31] of make-pt4-remix.main and return the extra samples; L is main's locals."""
    import math
    tl, T, order, src_cell, echo, name, info, data = (L[k] for k in ('tl', 'T', 'order', 'src_cell', 'echo', 'name', 'info', 'data'))
    slots, extra = iter(L['free_slots']), []

    def add(label, body, ft=0, vol=64, rep=0, replen=1, env=b''):
        if env:
            body, ft = body + struct.pack('>I', len(env)) + env, ft | 0x80
        ln = (len(body) - (len(env) + 4 if env else 0)) // 2
        extra.append((label.encode('latin1').ljust(22, b'\0')[:22] + struct.pack('>HBBHH', ln, ft, vol, rep, replen), body))
        return next(slots)

    def num(nm):
        assert nm in name, 'source sample %r not found in %r' % (nm, name)
        return name.index(nm) + 1

    def src(t, k):
        c = src_cell(order[tl[t][0]], tl[t][1], k)
        return (c[0] & 0xF0) | (c[2] >> 4), (c[0] & 15) << 8 | c[1], c[2] & 15, c[3]

    def put(ch, t, s, period, e=0, p=0):
        if 0 <= t < T:
            echo[ch][t] = [s, period, e, p]

    # Sample sounding on each source channel at each row.
    cs = [[0] * T for _ in range(4)]
    for k in range(4):
        s = 0
        for t in range(T):
            s = src(t, k)[0] or s
            cs[k][t] = s

    # --- samples --------------------------------------------------------------------------------------------
    detuned = {}
    for nm in TONAL:
        n = num(nm) - 1
        ln, ft, vol, rep, replen = info[n]
        detuned[n + 1] = add('ft+1 ' + nm, data[n], 1, vol, rep, replen)
    pulse = add('pulse 25%', s8([90] * 8 + [-90] * 24), vol=24, replen=16)
    saw = add('saw', s8(i * 6 - 93 for i in range(32)), vol=20, replen=16)
    sub = add('sub', s8(70 * math.sin(a) + 30 * math.sin(2 * a) + 14 * math.sin(3 * a)
                        for a in (2 * math.pi * i / 256 for i in range(256))), vol=56, replen=128)
    # Gate pad: DYN envelope, 5 chunks of 1024 words; loopseg 1 = chunks 1..4 repeat for as long as the note lasts.
    segs = [(1024, 64), (1024, 48), (1024, 6), (1024, 28), (1024, 6)]
    env = struct.pack('>HH', len(segs), 1) + b''.join(struct.pack('>HH', *g) for g in segs)
    gate = add('dyn gate pad', s8((i % 64 * 3 - 94) * 0.6 + (40 if i % 64 < 32 else -40) for i in range(10240)), vol=34, env=env)
    orch = num('orch-hit')
    rev = add('orch-hit reversed', data[orch - 1][::-1], vol=info[orch - 1][2])

    # --- root from the bass: pitch class per row, None where longbase rests ------------------------------------
    longbase, root, last, age = num('longbase'), [None] * T, None, 99
    for t in range(T):
        s, period, _, _ = src(t, 0)
        if period:
            last, age = ((note_idx(period) - 4) % 12, 0) if cs[0][t] == longbase else (None, 99)
        age += 1
        root[t] = last if age <= 24 else None
    for t in range(T):                                            # hold one root per 8-row block: the commonest
        if tl[t][1] % 8 == 0:
            blk = [root[u] for u in range(t, min(T, t + 8)) if tl[u][0] == tl[t][0]]
            best = max(set(blk), key=blk.count)
            for u in range(t, t + len(blk)):
                root[u] = best

    # --- echo 2 (9-12): echo 1 again 3 rows later at its volume, back on the source side --------------------
    for k in range(4):
        ls = 0
        for t, c in enumerate(list(echo[remix.ECHO_CH[k]])):
            if not c:
                continue
            ls = c[0] or ls
            if c[1] and ls:
                put(8 + k, t + 3, ls, c[1], 12, max(1, c[3] if c[2] == 12 else info[ls - 32][2] // 2))
            elif c[2] == 12 and not c[3]:
                put(8 + k, t + 3, 0, 0, 12, 0)

    # --- double (13-16): the source on the other side, tonal samples on their finetune +1 copies (chorus); a wide
    # module plays each channel at half the level of an 8-channel one, the double gives that back -------------------------------
    for k in range(4):
        for t in range(T):
            s, period, e, p = src(t, k)
            if e in (11, 13, 15) or (e == 14 and p >> 4 in (6, 14)):
                e = p = 0                                         # song control stays on the source channels
            if s or period or e or p:
                put(12 + (k ^ 1), t, detuned.get(s, s), period, e, p)

    # --- pads, gate pad, sequencer: follow the root ---------------------------------------------------------------
    since = 0
    for t in range(T):
        pos, row = tl[t]
        r, prev = root[t], root[t - 1] if t else None
        if r is None:
            if prev is not None:
                for ch in (16, 17, 19, 20, 21):     # release: fade out over the next rows, not a hard cut
                    for dt in range(4):
                        if t + dt < T and root[t + dt] is None and not any(echo[ch][t + dt] or ()):
                            put(ch, t + dt, 0, 0, 10, 0x08)
            continue
        strike = r != prev or row % 32 == 0
        since = 0 if strike else since + 1   # rows since the pad struck
        # pluck: arpeggio (a per-row effect) for 4 rows, then a volume slide down so the pad decays instead of holding
        put(16, t, pulse if strike else 0, per(12 + r) if strike else 0, *((0, 0x7C) if since < 3 else (10, 0x04)))
        # pad B: vibrato / tremolo for 6 rows after the strike, then a slow volume slide so it decays too
        put(17, t, saw if strike else 0, per(19 + r) if strike else 0,
            *(((7, 0x46) if pos % 8 >= 4 else (4, 0x42)) if since < 6 else (10, 0x01)))
        if t >= T // 4:
            if strike or t == T // 4:
                put(19, t, gate, per(24 + r))
        if pos >= 2 and row % 2 == 0:
            i = row // 2 % 8
            fx = [(12, 0x1C), (14, 0xC2), (9, 0x01), (14, 0xD1)][i % 4]
            if fx[0] == 9 and len(data[num('another drop') - 1]) < 1024:
                fx = (12, 0x14)
            put(20 + i % 2, t, num('another drop'), per(12 + r + SEQ_STEPS[i]), *fx)
            put(29 - i % 2, t + 3, num('another drop'), per(12 + r + SEQ_STEPS[i]), 12, 0x12)

    # --- bass double (19) --------------------------------------------------------------------------------------------
    on = False
    for t in range(T):
        s, period, e, p = src(t, 0)
        if cs[0][t] == longbase and period:
            if e in (1, 2, 3):
                p = max(1, round(p * 0.63))                       # 8 semitones up: slide steps shrink with the period
            elif e not in (10, 12) and not (e == 0 and p):          # keep the arpeggio: it must stay in key with the source
                e = p = 0
            put(18, t, sub if s or not on else 0, per(note_idx(period) + 8), e, p)
            for dt in range(4, 24):                           # fade the sub out after the strike: no drone between notes
                if t + dt < T and not src(t + dt, 0)[1] and not echo[18][t + dt]:
                    put(18, t + dt, 0, 0, 10, 0x03)
                else:
                    break
            on = True
        elif period and on:
            put(18, t, 0, 0, 12, 0)
            on = False

    # --- lead doubles (23-24) and sub-kick (25) ---------------------------------------------------------------------
    up = {num(nm): d for nm, d in LEAD_UP.items()}
    kick, feeding = num('bassdrum'), {}
    for t in range(T):
        for k in range(4):
            s, period, e, p = src(t, k)
            ch = 22 if k in (0, 3) else 23
            if cs[k][t] in up:
                if e in (1, 2, 3):
                    p = max(1, p // 2)
                elif e == 12:
                    p = p // 3
                elif e != 4 and not (e == 0 and p):                # arpeggio stays: the double must follow the chord
                    e = p = 0
                if period or e or p:
                    idx = note_idx(period) + up[cs[k][t]] if period else 0
                    idx -= 12 if idx > 35 else 0               # stay inside the normal period range: no piercing top notes
                    put(ch, t, saw if period and e != 3 else 0, per(idx) if period else 0, e, p)
                if period:
                    feeding[ch] = k
            elif period and feeding.get(ch) == k:
                put(ch, t, 0, 0, 12, 0)
                del feeding[ch]
            if period and cs[k][t] == kick:
                put(24, t, kick, per(note_idx(period) - 12), 12, 0x40)

    # --- fills and risers ---------------------------------------------------------------------------------------------
    snare, wood, lightwood = num('snare'), num('wood'), num('lightwood')
    hit = max(set(p for t in range(T) for k in range(4) for s, p, _, _ in [src(t, k)] if p and cs[k][t] == orch) or {PT[21]})
    for t in range(T):
        pos, row = tl[t]
        if pos % 4 == 3 and row >= 56:
            put(25, t, snare, PT[21], *((12, 0x10 + (row - 56) * 12) if row < 60 else (14, 0x93)))
        if pos % 8 == 7:
            if row >= 56:
                put(26 if row % 2 == 0 else 27, t, wood if row % 2 == 0 else lightwood, per(30 - (row - 56) * 2),
                    14, 0x13 if row % 2 == 0 else 0x23)
            if row == 48:
                put(30, t, saw, PT[12], 12, 0x0C)
                put(31, t, rev, hit)
            elif row > 48:
                put(30, t, 0, 0, 1, 0x04)
        if pos % 8 == 3 and row >= 48:
            if row == 48:
                put(31, t, pulse, PT[12], 14, 0x31)                # glissando on: the slide moves in semitone steps
            elif row == 49:
                put(31, t, 0, PT[35], 3, 0x06)
            else:
                put(31, t, 0, 0, *((3, 0) if row < 63 else (14, 0x30)))
        if row == 0 and pos % 4 == 0 and t:
            for ch in (30, 31):
                put(ch, t, 0, 0, 12, 0)
    # --- held notes on the copies (5-16): the source repeats the same note on every row (a drone); after 8 rows the copy
    # fades it instead, so a drone is one note, not four stacked. Channels 1-4 stay untouched. ---
    for ch in range(4, 16):
        run, last = 0, None
        for t in range(T):
            c = echo[ch][t]
            key = (c[0], c[1]) if c and c[1] else None
            run = run + 1 if key and key == last else 0
            if key:
                last = key
            elif c and not any(c):
                last = None
            if run >= 8:
                echo[ch][t] = [0, 0, 10, 0x01]
    return extra


def main(src_path, out_path):
    w = remix.main(src_path, out_path, nch=NCH, layers=layers, title=b' pt4 show')
    assert w[1080:1084] == b'32CH'
    songlen, first, count, notes = w[950], {}, {}, [0] * NCH
    for i in range(songlen * 64 * NCH):
        c = w[1084 + i * 4:1088 + i * 4]
        pos, row, ch = i // (64 * NCH), i // NCH % 64, i % NCH
        notes[ch] += bool((c[0] & 15) << 8 | c[1])
        for k in remix.effect_names([c]):
            first.setdefault(k, (pos, row, ch + 1))
            count[k] = count.get(k, 0) + 1
    assert all(notes), 'channels without a note: %s' % [ch + 1 for ch in range(NCH) if not notes[ch]]
    print('\n| Effect | Cells | First at position (= pattern) / row / channel |\n|---|---|---|')
    for k in remix.REQUIRED:
        print('| %s | %d | %d / %d / %d%s |' % (k, count[k], *first[k], ' (ignored in a wide module)' if k[0] == '8' else ''))
    print('\n| Channels | Side | Layer | Notes |\n|---|---|---|---|')
    for chs, side, what in LAYERS:
        a, b = (int(x) for x in (chs.split('-') * 2)[:2])
        print('| %s | %s | %s | %d |' % (chs, side, what, sum(notes[a - 1:b])))


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
