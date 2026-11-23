#!/usr/bin/env python3
"""Build a ProTracker 4.1 test song from a real 4-channel MOD: an 8CHN remix with echo channels.

  python3 tools/make-pt4-remix.py SOURCE.mod OUT.mod

Channels 1-4 are the source song untouched. Channels 5-8 are echoes: the same notes DELAY rows later on
half-volume copies of the samples (PT4X slots 32+), cross-panned. Every ProTracker 4.1 effect is then placed
on the echo channels (list in REQUIRED); the tool fails if one is missing from the written file.
Format: third-party/protracker4/docs/PT41_FORMAT.md. The song is unrolled to one pattern per position so an
echo can cross a pattern boundary.
"""
import struct
import sys

DELAY = 3                      # echo delay in rows
NO_ECHO = ('bassdrum', 'base', 'longbase')   # sample names that get no echo (bass turns to mud)
DYN_SAMPLE = 'orch-hit'        # its echo copy gets the DYN envelope with a loop segment
ECHO_CH = (5, 4, 7, 6)         # source channel k echoes on this channel: the other stereo side (pairs are L R R L)
REQUIRED = ['0', '1', '2', '3', '4', '5', '6', '7', '8x0', '81', '82', '83', '84', '85', '86', '87', '9', 'A', 'B',
            'C', 'D', 'E0', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'EA', 'EB', 'EC', 'ED', 'EE', 'EF',
            'F speed', 'F tempo', 'notes-ext']


def effect_names(cells):
    """Effect census of 4-byte cells -> {name: count}; the same naming as REQUIRED."""
    out = {}
    for c in cells:
        per, e, p = (c[0] & 15) << 8 | c[1], c[2] & 15, c[3]
        if per and not 113 <= per <= 856:
            out['notes-ext'] = out.get('notes-ext', 0) + 1
        if not (e or p):
            continue
        if e == 8:
            k = '8x0' if not p & 15 else '8%X' % (p >> 4)
        elif e == 14:
            k = 'E%X' % (p >> 4)
        elif e == 15:
            k = 'F tempo' if p >= 32 else 'F speed'
        else:
            k = '%X' % e
        out[k] = out.get(k, 0) + 1
    return out


def main(src_path, out_path, nch=8, layers=None, title=b' pt4 echo'):
    """nch > 8 writes a wide module; layers(locals) fills echo[8..nch-1] and returns extra samples (make-pt4-showcase.py)."""
    d = open(src_path, 'rb').read()
    assert d[1080:1084] == b'M.K.', 'source must be a 4-channel M.K. module'
    songlen = d[950]
    order = list(d[952:952 + songlen])
    npat = max(d[952:1080]) + 1
    assert songlen <= 100, 'unrolled song needs one pattern per position (PT 4.1 holds 100)'
    hdr = [d[20 + 30 * n:50 + 30 * n] for n in range(31)]
    info = [struct.unpack('>HBBHH', h[22:]) for h in hdr]          # length, finetune, volume, repeat, replen (words)
    name = [h[:22].rstrip(b'\0').decode('latin1') for h in hdr]
    data, off = [], 1084 + npat * 1024
    for ln, *_ in info:
        data.append(d[off:off + ln * 2])
        off += ln * 2
    used = max(n for n in range(31) if info[n][0]) + 1
    assert used <= 31, 'echo copies need one PT4X slot per source sample'

    def src_cell(pat, row, ch):
        o = 1084 + pat * 1024 + row * 16 + ch * 4
        return d[o:o + 4]

    # Timeline of the rows that really play (Dxx breaks followed), as (position, row).
    tl, row0 = [], 0
    for pos, pat in enumerate(order):
        nxt = 0
        for row in range(row0, 64):
            tl.append((pos, row))
            brk = [c[3] for c in (src_cell(pat, row, ch) for ch in range(4)) if c[2] & 15 == 13]
            assert not any(src_cell(pat, row, ch)[2] & 15 == 11 for ch in range(4)), 'Bxx in the source is not handled'
            if brk:
                nxt = (brk[0] >> 4) * 10 + (brk[0] & 15)
                nxt = 0 if nxt > 63 else nxt
                break
        row0 = nxt
    T = len(tl)

    # Echo cells [sample, period, effect, param] per echo channel and timeline row.
    echo = {ch: [None] * T for ch in range(4, nch)}
    cur = {ch: [0] * T for ch in range(4, nch)}                      # source sample (1-based) sounding on the echo channel
    for k in range(4):
        ech, smp, playing = ECHO_CH[k], 0, 0
        for t, (pos, row) in enumerate(tl):
            c = src_cell(order[pos], row, k)
            s, per, e, p = (c[0] & 0xF0) | (c[2] >> 4), (c[0] & 15) << 8 | c[1], c[2] & 15, c[3]
            smp = s or smp
            u = t + DELAY
            if u >= T:
                break
            if smp and name[smp - 1] in NO_ECHO:
                if per and playing:
                    echo[ech][u] = [0, 0, 12, 0]                   # silence the echo voice under a bass note
                    playing = 0
            else:
                if e in (11, 13, 15):
                    e = p = 0                                      # song control stays on the source channels
                if e == 12:
                    p = (p + 1) // 2
                if s or per or e or p:
                    echo[ech][u] = [s + 31 if s else 0, per, e, p]
                playing = (s + 31 if s else playing) if per else playing
            cur[ech][u] = playing and playing - 31
        for t in range(1, T):
            cur[ech][t] = cur[ech][t] or cur[ech][t - 1]

    # Extra samples [(30-byte header, data + envelope)]: first into the free slots up to 31, the rest behind the echo copies.
    free_slots = list(range(used + 1, 32)) + list(range(32 + used, 64))
    extra = layers(locals()) if layers else []
    assert len(extra) <= len(free_slots), 'more extra samples than free slots'

    # --- effect placement on the echo channels -------------------------------------------------------------
    def cell(ch, t):
        return echo[ch][t] if 0 <= t < T and echo[ch][t] else [0, 0, 0, 0]

    def free(ch, t):
        return 0 <= t < T and cell(ch, t)[2] == 0 and cell(ch, t)[3] == 0

    def put(ch, t, e, p):
        c = cell(ch, t)
        echo[ch][t] = [c[0], c[1], e, p]

    def is_note(ch, t):
        return cell(ch, t)[1] != 0

    def held(ch, t):                                               # a long sample was struck 1..3 rows ago, still rings
        s = cur[ch][t]
        return (not is_note(ch, t) and s and len(data[s - 1]) >= 6000
                and any(is_note(ch, t - i) for i in (1, 2, 3)) and not is_note(ch, t - 1 if is_note(ch, t - 2) else t))

    def looped(ch, t):
        s = cur[ch][t]
        return bool(s) and info[s - 1][4] > 1

    def offset_ok(ch, t):                                          # 904 = 1024 bytes in, before the loop end
        s = cur[ch][t]
        ln, _, _, rep, replen = info[s - 1] if s else (0, 0, 0, 0, 0)
        return is_note(ch, t) and ln * 2 >= 6000 and (replen <= 1 or (rep + replen) * 2 > 3000)

    def same_pattern(ch, t):                                       # E6x loop: 4 contiguous rows of one pattern
        return t + 3 < T and tl[t + 3] == (tl[t][0], tl[t][1] + 3)

    anything = lambda ch, t: True
    plan = [  # name, cells (row offset, effect, param), anchor condition, how many
        ('arpeggio octave', [(0, 0, 0xC0)], lambda ch, t: is_note(ch, t) and cell(ch, t)[1] >= 226, 6),
        ('porta up', [(0, 1, 0x01)], is_note, 6),
        ('tremolo', [(0, 7, 0x44), (1, 7, 0x44)], held, 6),
        ('colour', [(0, 8, 0x30)], anything, 8),
        ('backwards', [(0, 8, 0x11), (1, 8, 0x1F)], held, 6),
        ('volume slide up', [(0, 8, 0x22), (1, 8, 0x2F)], held, 4),
        ('volume slide down', [(0, 8, 0x33), (1, 8, 0x3F)], held, 4),
        ('pair blend', [(0, 8, 0x47), (16, 8, 0x4F)], anything, 2),
        ('85y (does nothing)', [(0, 8, 0x51)], anything, 1),
        ('retrigger interval', [(0, 8, 0x62), (1, 8, 0x6F)], held, 4),
        ('tremor', [(0, 8, 0x72), (4, 8, 0x7F)], held, 4),
        ('sample offset', [(0, 9, 0x04)], offset_ok, 6),
        ('filter on then off', [(0, 14, 0x00), (32, 14, 0x01)], anything, 1),
        ('fine porta up', [(0, 14, 0x11)], is_note, 6),
        ('fine porta down', [(0, 14, 0x21)], is_note, 6),
        ('glissando', [(0, 14, 0x31), (8, 14, 0x30)], anything, 1),
        ('vibrato wave', [(0, 14, 0x41), (16, 14, 0x40)], anything, 1),
        ('finetune', [(0, 14, 0x51)], is_note, 6),
        ('pattern loop', [(0, 14, 0x60), (3, 14, 0x61)], same_pattern, 1),
        ('tremolo wave', [(0, 14, 0x72), (16, 14, 0x70)], anything, 1),
        ('E8x (does nothing)', [(0, 14, 0x80)], anything, 1),
        ('retrigger', [(0, 14, 0x91)], is_note, 6),
        ('fine volume up', [(0, 14, 0xA2)], is_note, 6),
        ('fine volume down', [(0, 14, 0xB2)], is_note, 6),
        ('note cut', [(0, 14, 0xC1)], is_note, 6),
        ('note delay', [(0, 14, 0xD1)], is_note, 12),
        ('pattern delay', [(0, 14, 0xE1)], anything, 1),
        ('funk repeat', [(0, 14, 0xF4), (8, 14, 0xF0)], looped, 1),
        ('tempo', [(0, 15, 0x78), (64, 15, 0x7D)], anything, 1),
    ]
    put(4, 0, 15, 0x7D)                                            # tempo 125 stated at the start
    put(5, 0, 14, 0x01)                                            # filter off at the start
    put(4, T - 1, 11, 0x00)                                        # position jump back to the start
    lo, hi = T // 20, T - T // 20
    for i, (label, cells, cond, count) in enumerate(plan):
        ok = lambda ch, t: cond(ch, t) and all(free(ch, t + dt) for dt, _, _ in cells)
        cands = [(t, ch) for t in range(lo, hi) for ch in range(4, 8) if ok(ch, t)]
        assert cands, 'no place in the song for: ' + label
        for j in range(count):
            # spread over the song; each effect starts at its own phase so they do not pile up in one spot
            t, ch = cands[(len(cands) * (2 * j + 1) // (2 * count) + i * 7) % len(cands)]
            if ok(ch, t):
                for dt, e, p in cells:
                    put(ch, t + dt, e, p)
    # Notes-ext: an echo of C-1 one octave down (period 1712). Without the setup switch PT plays it as C-1 again.
    low = [(t, ch) for ch in range(4, 8) for t in range(T) if cell(ch, t)[1] == 856][:8]
    assert low, 'no C-1 echo note for the notes-ext cell'
    for t, ch in low:
        echo[ch][t][1] = 1712

    # --- write ---------------------------------------------------------------------------------------------
    rowlen, tag = nch * 4, b'8CHN' if nch == 8 else b'%dCH' % nch
    pats = bytearray(songlen * 64 * rowlen)
    played = set(tl)                                               # rows after a Dxx break never play: leave them empty
    for pos, pat in enumerate(order):
        for row in range(64):
            if (pos, row) not in played:
                continue
            for ch in range(4):
                o = (pos * 64 + row) * rowlen + ch * 4
                pats[o:o + 4] = src_cell(pat, row, ch)
    for ch in range(4, nch):
        for t, c in enumerate(echo[ch]):
            if c:
                s, per, e, p = c
                o = (tl[t][0] * 64 + tl[t][1]) * rowlen + ch * 4
                pats[o:o + 4] = bytes([(s & 0xF0) | per >> 8, per & 255, (s & 15) << 4 | e, p])

    out = bytearray(d[:950])
    out[:20] = (name_of_song(d) + title).ljust(20, b'\0')[:20]
    for i, (h, body) in enumerate(extra[:31 - used]):
        out[20 + 30 * (used + i):50 + 30 * (used + i)] = h
        data[used + i] = body
    out += bytes([songlen, 0x7F]) + bytes(range(songlen)).ljust(128, b'\0') + tag + pats + b''.join(data)
    xh, xd = b'', b''
    for n in range(used):
        ln, ft, vol, rep, replen = info[n]
        body = data[n]
        if name[n] == DYN_SAMPLE and ln:
            # DYN envelope: four chunks falling in volume, loopseg 3 = the last chunk repeats (the dynamic loop).
            q = ln // 4
            segs = [(q, 64), (q, 40), (q, 24), (ln - 3 * q, 12)]
            env = struct.pack('>HH', len(segs), 3) + b''.join(struct.pack('>HH', *s) for s in segs)
            body += struct.pack('>I', len(env)) + env
            ft |= 0x80
        xh += (b'echo ' + hdr[n][:22].rstrip(b'\0')).ljust(22, b'\0')[:22] + struct.pack('>HBBHH', ln, ft, (vol + 1) // 2, rep, replen)
        xd += body
    for h, body in extra[31 - used:]:
        xh += h
        xd += body
    out += b'PT4X' + struct.pack('>I', len(xh) // 30) + xh + xd
    out += b'PT41' + struct.pack('>HH', 0x0412, 7)                 # footer: 8xy sub-effects, PT4X block, DYN envelope
    open(out_path, 'wb').write(out)

    # Self-check on the bytes written: every effect is there, and the echo really is the source DELAY rows later.
    w = bytes(out)
    cells = [w[1084 + i:1088 + i] for i in range(0, len(pats), 4)]
    census = effect_names(cells)
    missing = [k for k in REQUIRED if k not in census]
    assert not missing, 'effects missing from the written song: %s' % missing
    echoed = sum(1 for k in range(4) for t in range(T - DELAY)
                 if (src_cell(order[tl[t][0]], tl[t][1], k)[0] & 15) << 8 | src_cell(order[tl[t][0]], tl[t][1], k)[1]
                 and cell(ECHO_CH[k], t + DELAY)[1])
    assert echoed > 100, 'echo channels carry too few of the source notes'
    print('%s: %s, %d positions, %d rows played, %d echo notes, %d bytes' % (out_path, tag.decode(), songlen, T, echoed, len(out)))
    print('samples 1-%d source, 32-%d echo copies at half volume, DYN envelope on %d' % (used, 31 + used, 32 + name.index(DYN_SAMPLE)))
    print('effects: ' + ' '.join('%s=%d' % (k, census[k]) for k in REQUIRED))
    return w


def name_of_song(d):
    return d[:20].rstrip(b'\0')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
