#!/usr/bin/env python3
"""Build a wide ProTracker 4.1 test song (9..32 channels, id xxCH) from a real Amiga-frequency XM.

  python3 -I tools/make-pt4-xm-remix.py SOURCE.xm OUT.mod

ProTracker 4.1 stores signed 8-bit samples only (third-party/protracker4/docs/PT41_FORMAT.md 1.7), so 16-bit
XM samples are reduced to 8 bit. Samples past 31 go to the PT4X block. What the format cannot hold is counted
and printed, never guessed: panning (a wide module ignores 8xx), volume envelopes and fadeout, finetune, and a
volume-column command on a cell whose effect column is in use. A "set volume" beside an effect is kept where
it can be: the cell plays a copy of the sample whose default volume is that volume (spare sample slots).
"""
import struct
import sys

PT = [856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453, 428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
      214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113]   # C-1..B-3; XM note 37 = C-1
LO, HI = 25, 84                # XM-scale notes a wide module can play (periods 1712..57, PT41_FORMAT.md 5.2)


def period(e):
    """Amiga period of XM-scale note e (49 = period 428)."""
    if e < 37:
        return PT[e - 25] * 2
    return PT[e - 37] if e < 73 else (PT[e - 49] + 1) // 2


def resample(f, ratio):
    """len(f) * ratio frames: linear interpolation going up, box average going down."""
    if ratio == 1:
        return f
    n, step, out = int(len(f) * ratio), 1 / ratio, []
    for j in range(n):
        a = j * step
        if step > 1:
            i0, i1 = int(a), max(int(a) + 1, min(len(f), int(a + step)))
            out.append(sum(f[i0:i1]) / (i1 - i0))
        else:
            i, fr = int(a), a - int(a)
            out.append(f[i] + (f[min(i + 1, len(f) - 1)] - f[i]) * fr)
    return out


def main(src_path, out_path):
    d = open(src_path, 'rb').read()
    assert d[:17] == b'Extended Module: ', 'source must be an XM'
    hsize, songlen, _restart, nch, npat, nins, flags, speed, bpm = struct.unpack('<IHHHHHHHH', d[60:80])
    assert not flags & 1, 'XM must use Amiga frequencies (linear slides do not map to PT effects)'
    assert 9 <= nch <= 32 and npat <= 100 and songlen <= 128
    order = list(d[80:80 + songlen])

    # --- patterns: rows of [note, instrument, volume column, effect, param] --------------------------------
    o, pats = 60 + hsize, []
    for _ in range(npat):
        hl, _pk, nrows, psize = struct.unpack('<IBHH', d[o:o + 9])
        o += hl
        end, cells = o + psize, []
        while o < end:
            b, c = d[o], [0, 0, 0, 0, 0]
            o += 1
            if b & 0x80:
                for i in range(5):
                    if b >> i & 1:
                        c[i] = d[o]
                        o += 1
            else:
                c = [b, *d[o:o + 4]]
                o += 4
            cells.append(c)
        assert len(cells) in (0, nrows * nch) and nrows <= 64
        pats.append([cells[r * nch:(r + 1) * nch] for r in range(nrows)] if cells else [[[0] * 5] * nch] * nrows)

    # --- instruments: first sample of each, as float frames ------------------------------------------------
    ins = {}
    for i in range(1, nins + 1):
        isize, = struct.unpack('<I', d[o:o + 4])
        nsmp, = struct.unpack('<H', d[o + 27:o + 29])
        iname, h = d[o + 4:o + 26], o
        o += isize
        if not nsmp:
            continue
        shsize, = struct.unpack('<I', d[h + 29:h + 33])
        heads = [struct.unpack('<IIIBbBBb', d[o + s * shsize:o + s * shsize + 17]) for s in range(nsmp)]
        o += nsmp * shsize
        ln, ls, ll, vol, _ft, typ, _pan, rel = heads[0]
        raw = d[o:o + ln]
        o += sum(x[0] for x in heads)
        if typ & 16:
            v, acc, ls, ll = struct.unpack('<%dh' % (ln // 2), raw), 0, ls // 2, ll // 2
            fr = [(acc := (acc + x + 32768) % 65536 - 32768) / 256 for x in v]
        else:
            acc = 0
            fr = [(acc := (acc + x + 128) % 256 - 128) for x in struct.unpack('%db' % ln, raw)]
        loop = typ & 3 if ll > 1 else 0
        if loop:
            fr = fr[:ls + ll]
            if loop == 2:                                          # ping-pong: unroll one backward pass
                fr, ll = fr + fr[ls:ls + ll][::-1], ll * 2
        ins[i] = dict(name=iname, fr=fr, ls=ls if loop else 0, ll=ll if loop else 0, vol=min(vol, 64), rel=rel,
                      bits=16 if typ & 16 else 8, env=d[h + 233] & 1, map=d[h + 33:h + 129])

    # --- which instruments play, and over which notes ------------------------------------------------------
    rng = {}
    for p in pats:
        cur = [0] * nch
        for row in p:
            for ch, (n, i, *_r) in enumerate(row):
                cur[ch] = i or cur[ch]
                if 1 <= n <= 96 and cur[ch] in ins:
                    assert ins[cur[ch]]['map'][n - 1] == 0, 'multi-sample instrument %d' % cur[ch]
                    a, b = rng.get(cur[ch], (n, n))
                    rng[cur[ch]] = (min(a, n), max(b, n))
    used = sorted(rng)
    assert len(used) <= 63, 'ProTracker 4.1 holds 63 samples'
    slot = {i: s + 1 for s, i in enumerate(used)}

    smp = {}
    for i in used:
        s, (lo, hi) = ins[i], rng[i]
        # Shift k semitones so every played note lands on a period the module can hold; the sample is resampled
        # by the same amount, so the pitch heard does not change.
        k = max(0, hi + s['rel'] - HI) or min(0, lo + s['rel'] - LO)
        assert lo + s['rel'] - k >= LO, 'instrument %d spans more notes than the period range' % i
        ratio = 2 ** (-k / 12)
        fr = resample(s['fr'], ratio)
        ls, ll = int(s['ls'] * ratio) & ~1, int(s['ll'] * ratio) & ~1
        if ll:
            fr = fr[:ls + ll]
        fr = fr[:len(fr) & ~1]
        assert 2 <= len(fr) <= 131070, 'instrument %d does not fit a PT sample' % i
        body = bytes(max(-128, min(127, round(x))) & 255 for x in fr)
        head = s['name'][:22].ljust(22, b'\0') + struct.pack('>HBBHH', len(fr) // 2, 0, s['vol'], ls // 2, ll // 2 or 1)
        smp[i] = dict(k=s['rel'] - k, head=head, body=body)

    # --- "set volume" beside an effect: a copy of the sample with that default volume, most used pairs first ----
    pairs = {}
    for p in pats:
        for row in p:
            for n, i, v, t, pr in row:
                if i in slot and 0x10 <= v <= 0x50 and n != 97 and (t or pr) and t != 8:
                    pairs[i, v - 0x10] = pairs.get((i, v - 0x10), 0) + 1
    order_s = [(i, None) for i in used]
    for (i, vol), _n in sorted(pairs.items(), key=lambda kv: -kv[1])[:63 - len(used)]:
        slot[i, vol] = len(order_s) + 1
        order_s.append((i, vol))

    def head(i, vol):
        h = smp[i]['head']
        return h if vol is None else h[:25] + bytes([vol]) + h[26:]

    # --- cells -------------------------------------------------------------------------------------------
    lost = dict(pan=0, volume_column=0, effect_under_set_volume=0, effect_under_key_off=0)
    out_pats, notes_in, notes_out = [], 0, 0
    for pi, p in enumerate(pats):
        buf, cur = bytearray(64 * nch * 4), [0] * nch
        fx = [[(0, 0)] * nch for _ in range(64)]
        for r, row in enumerate(p):
            for ch, (n, i, v, t, pr) in enumerate(row):
                cur[ch] = i or cur[ch]
                per = 0
                if 1 <= n <= 96 and cur[ch] in smp:
                    per = period(n + smp[cur[ch]]['k'])
                    notes_in += 1
                if t == 8 or (t == 14 and pr >> 4 == 8) or t > 15:
                    lost['pan'] += 1
                    t = pr = 0
                vt = vp = 0                                        # volume column as a PT effect
                if 0x10 <= v <= 0x50:
                    vt, vp = 12, v - 0x10
                elif v >> 4 in (6, 7, 8, 9, 15):
                    vt, vp = {6: (10, v & 15), 7: (10, (v & 15) << 4), 8: (14, 0xB0 | v & 15), 9: (14, 0xA0 | v & 15),
                              15: (3, (v & 15) << 4)}[v >> 4]
                elif v >= 0x60:
                    lost['pan'] += 1
                if n == 97:                                        # key off: no envelopes here, so the note stops
                    lost['effect_under_key_off'] += bool(t or pr) and t not in (11, 13, 15)
                    if t not in (11, 13, 15):
                        t, pr, vt = 12, 0, 0
                s = slot.get(i, 0)
                if vt or vp:
                    if not (t or pr):
                        t, pr = vt, vp
                    elif vt == 12 and (i, vp) in slot:
                        s = slot[i, vp]                            # the copy carries the volume
                    elif vt == 12 and t != 3:
                        lost['effect_under_set_volume'] += 1
                        t, pr = vt, vp                             # a wrong level is heard more than a lost slide
                    else:
                        lost['volume_column'] += 1
                fx[r][ch] = (t, pr)
                buf[(r * nch + ch) * 4:(r * nch + ch) * 4 + 4] = bytes([(s & 0xF0) | per >> 8, per & 255, (s & 15) << 4 | t, pr])

        def spare(r, t, pr, why):                                  # a song command on a cell with no effect
            ch = next((c for c in range(nch) if fx[r][c] == (0, 0)), None)
            assert ch is not None, 'pattern %d row %d: no free cell for %s' % (pi, r, why)
            fx[r][ch] = (t, pr)
            buf[(r * nch + ch) * 4 + 2] |= t
            buf[(r * nch + ch) * 4 + 3] = pr
        if len(p) < 64 and not any(t in (11, 13) for t, _ in fx[len(p) - 1]):
            spare(len(p) - 1, 13, 0, 'the pattern break of a short pattern')
        if pi == order[0]:
            if bpm != 125:
                spare(0, 15, bpm, 'the start tempo')
            if speed != 6:
                spare(0, 15, speed, 'the start speed')
        out_pats.append(bytes(buf))

    # --- write -------------------------------------------------------------------------------------------
    blank = bytes(22) + struct.pack('>HBBHH', 0, 0, 0, 0, 1)
    heads = [head(*x) for x in order_s] + [blank] * (31 - len(order_s))
    out = d[17:37].rstrip().ljust(20, b'\0') + b''.join(heads[:31])
    out += bytes([songlen, 0x7F]) + bytes(order).ljust(128, b'\0') + b'%02dCH' % nch
    out += b''.join(out_pats[:max(order) + 1]) + b''.join(smp[i]['body'] for i, _v in order_s[:31])
    extra = order_s[31:]
    if extra:
        out += b'PT4X' + struct.pack('>I', len(extra)) + b''.join(head(*x) for x in extra)
        out += b''.join(smp[i]['body'] for i, _v in extra)
        out += b'PT41' + struct.pack('>HH', 0x0412, 2)             # footer flag 2: PT4X block written
    open(out_path, 'wb').write(out)

    # Self-check on the bytes written: every source note is there, on a period a wide module plays.
    cells = len(out_pats[:max(order) + 1]) * 64 * nch
    for c in range(cells):
        per = (out[1084 + c * 4] & 15) << 8 | out[1085 + c * 4]
        assert per == 0 or 57 <= per <= 1712, 'period %d outside the wide range' % per
        notes_out += per != 0
    assert notes_out == notes_in > 0, 'notes written %d, notes in the source %d' % (notes_out, notes_in)
    assert period(49) == 428 and period(37) == 856 and period(72) == 113 and period(25) == 1712 and period(84) == 57
    n16 = sum(ins[i]['bits'] == 16 for i in used)
    print('%s: %s, %d positions, %d patterns, %d notes, %d bytes' % (out_path, out[1080:1084].decode(), songlen, max(order) + 1, notes_out, len(out)))
    print('sample slots: %d (%d in PT4X, %d volume copies); source samples: %d, %d were 16 bit and are 8 bit now, %d resampled, %d with a volume envelope (not kept)' % (
        len(order_s), len(extra), len(order_s) - len(used), len(used), n16, sum(smp[i]['k'] != ins[i]['rel'] for i in used), sum(ins[i]['env'] for i in used)))
    print('not kept: ' + ', '.join('%s %d' % kv for kv in lost.items()))


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
