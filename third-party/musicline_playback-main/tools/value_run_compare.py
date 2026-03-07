#!/usr/bin/env python3
"""
Value-run comparison of UADE vs MLINE WAV files.

Compares audio output by extracting "runs" of identical consecutive sample
values from each WAV file. This tests that the C++ port produces the same
waveform fetch sequence as UADE, while tolerating the expected DMA phase
offset (see docs/comparison_approach.md).

Two metrics:
  - Value sequence: ordered list of distinct held values must match (100%)
  - Run lengths: each run length should be within ±1 of UADE

Usage:
  # Compare stereo WAVs (left channel)
  python3 tools/value_run_compare.py /tmp/compare_uade.wav /tmp/compare_mline.wav

  # Compare right channel
  python3 tools/value_run_compare.py /tmp/compare_uade.wav /tmp/compare_mline.wav --right

  # Compare both stereo channels
  python3 tools/value_run_compare.py /tmp/compare_uade.wav /tmp/compare_mline.wav --both

  # Per-channel comparison (reads 4 mono WAV pairs from directory)
  python3 tools/value_run_compare.py --per-channel /tmp/compare
"""

import argparse
import wave
import struct
import sys
import os


def read_wav_channel(path, channel=0):
    """Read samples from specified channel of 16-bit WAV. 0=left, 1=right."""
    with wave.open(path, 'rb') as w:
        nch = w.getnchannels()
        nf = w.getnframes()
        raw = w.readframes(nf)
        samples = struct.unpack(f'<{nf * nch}h', raw)
        if nch == 1:
            return list(samples)
        return samples[channel::nch]


def extract_runs(samples):
    """Extract runs of identical values: [(value, count), ...]"""
    if not samples:
        return []
    runs = []
    cur_val = samples[0]
    cur_count = 1
    for s in samples[1:]:
        if s == cur_val:
            cur_count += 1
        else:
            runs.append((cur_val, cur_count))
            cur_val = s
            cur_count = 1
    runs.append((cur_val, cur_count))
    return runs


def skip_leading_silence(runs):
    """Skip leading zero-value runs."""
    for i, (val, cnt) in enumerate(runs):
        if val != 0:
            return runs[i:]
    return []


def find_best_offset(uade_vals, mline_vals, max_offset=10):
    """Find the run offset that maximizes value matches between UADE and MLINE.

    Returns (offset, matches, compare_len) where positive offset means MLINE
    is ahead (skip first 'offset' MLINE runs to align).
    """
    best_off = 0
    best_match = 0
    best_len = 0
    for off in range(-max_offset, max_offset + 1):
        u_start = max(0, off)
        m_start = max(0, -off)
        compare_len = min(len(uade_vals) - u_start, len(mline_vals) - m_start)
        if compare_len <= 0:
            continue
        matches = sum(1 for i in range(compare_len)
                      if uade_vals[u_start + i] == mline_vals[m_start + i])
        if matches > best_match:
            best_match = matches
            best_off = off
            best_len = compare_len
    return best_off, best_match, best_len


def compare_runs(uade_runs, mline_runs, channel_name, max_display=20):
    """Compare value sequences and run lengths. Returns True if value match is 100%.

    Per comparison_approach.md:
    1. Value sequence: ordered list of distinct held values must be identical (100%)
    2. Run lengths: each run length should be within ±1 of UADE
    Both are compared as flat lists after skipping leading silence.

    Automatically detects and compensates for the expected DMA startup phase
    offset (typically 1-3 runs) by finding the alignment that maximizes matches.
    """
    uade_runs = skip_leading_silence(uade_runs)
    mline_runs = skip_leading_silence(mline_runs)

    uade_vals = [v for v, c in uade_runs]
    mline_vals = [v for v, c in mline_runs]

    min_len = min(len(uade_vals), len(mline_vals))

    # Direct (offset=0) comparison first
    direct_matches = sum(1 for i in range(min_len) if uade_vals[i] == mline_vals[i])
    direct_pct = 100.0 * direct_matches / min_len if min_len > 0 else 100.0

    # If direct match isn't perfect, try to find best alignment offset
    offset = 0
    if direct_pct < 100.0:
        offset, _, _ = find_best_offset(uade_vals, mline_vals)

    u_start = max(0, offset)
    m_start = max(0, -offset)
    compare_len = min(len(uade_vals) - u_start, len(mline_vals) - m_start)

    # 1. Value sequence: compare at best alignment
    value_matches = sum(1 for i in range(compare_len)
                        if uade_vals[u_start + i] == mline_vals[m_start + i])
    value_pct = 100.0 * value_matches / compare_len if compare_len > 0 else 100.0

    # 2. Run lengths within ±1 (only for matching values)
    run_ok = 0
    run_bad = 0
    first_bad_idx = -1
    for i in range(compare_len):
        if uade_vals[u_start + i] == mline_vals[m_start + i]:
            diff = abs(uade_runs[u_start + i][1] - mline_runs[m_start + i][1])
            if diff <= 1:
                run_ok += 1
            else:
                run_bad += 1
                if first_bad_idx < 0:
                    first_bad_idx = i

    run_total = run_ok + run_bad
    run_pct = 100.0 * run_ok / run_total if run_total > 0 else 0

    # Find first value mismatch
    first_val_mismatch = -1
    for i in range(compare_len):
        if uade_vals[u_start + i] != mline_vals[m_start + i]:
            first_val_mismatch = i
            break

    print(f"--- {channel_name} ---")
    print(f"UADE runs: {len(uade_runs)}, MLINE runs: {len(mline_runs)}")
    if offset != 0:
        print(f"Phase offset: {offset} runs (DMA startup)")
    print(f"Compared: {compare_len} runs")
    print(f"Value sequence match: {value_matches}/{compare_len} ({value_pct:.1f}%)")
    print(f"Run lengths within +/-1: {run_ok}/{run_total} ({run_pct:.1f}%)")

    if first_val_mismatch >= 0:
        abs_idx = first_val_mismatch + u_start
        uade_sample_pos = sum(c for _, c in uade_runs[:abs_idx])
        time_est = uade_sample_pos / 28150.0
        print(f"\nFirst value mismatch at run {first_val_mismatch} (~{time_est:.3f}s):")
        start = max(0, first_val_mismatch - 3)
        end = min(compare_len, first_val_mismatch + max_display)
        for i in range(start, end):
            ui = u_start + i
            mi = m_start + i
            marker = " <<< MISMATCH" if uade_vals[ui] != mline_vals[mi] else ""
            print(f"  [{i}] UADE: val={uade_runs[ui][0]:6d} x{uade_runs[ui][1]:3d}  "
                  f"MLINE: val={mline_runs[mi][0]:6d} x{mline_runs[mi][1]:3d}{marker}")
    elif first_bad_idx >= 0:
        print(f"\nFirst run length mismatch (>+/-1) at run {first_bad_idx}:")
        start = max(0, first_bad_idx - 3)
        end = min(compare_len, first_bad_idx + 5)
        for i in range(start, end):
            ui = u_start + i
            mi = m_start + i
            marker = " <<< BAD RUN" if abs(uade_runs[ui][1] - mline_runs[mi][1]) > 1 else ""
            print(f"  [{i}] UADE: val={uade_runs[ui][0]:6d} x{uade_runs[ui][1]:3d}  "
                  f"MLINE: val={mline_runs[mi][0]:6d} x{mline_runs[mi][1]:3d}{marker}")
    else:
        print("\nPERFECT MATCH!")

    print()
    return value_pct == 100.0


def main():
    parser = argparse.ArgumentParser(
        description='Value-run comparison of UADE vs MLINE WAV files')
    parser.add_argument('uade_wav', nargs='?', help='Path to UADE WAV file (stereo mode)')
    parser.add_argument('mline_wav', nargs='?', help='Path to MLINE WAV file (stereo mode)')
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--left', '-l', action='store_true', help='Compare left channel only')
    group.add_argument('--right', '-r', action='store_true', help='Compare right channel only')
    group.add_argument('--both', '-b', action='store_true', default=True,
                       help='Compare both stereo channels (default)')
    group.add_argument('--per-channel', metavar='DIR',
                       help='Per-channel comparison: read mono WAVs from DIR '
                            '(expects DIR_uade_ch0.wav ... DIR_mline_ch3.wav)')
    args = parser.parse_args()

    # Per-channel mode
    if args.per_channel:
        base = args.per_channel
        all_pass = True
        amiga_ch_names = ['ch0 (Left)', 'ch1 (Right)', 'ch2 (Right)', 'ch3 (Left)']

        for ch in range(4):
            uade_path = f"{base}_uade_ch{ch}.wav"
            mline_path = f"{base}_mline_ch{ch}.wav"

            if not os.path.exists(uade_path):
                print(f"WARNING: {uade_path} not found, skipping ch{ch}")
                continue
            if not os.path.exists(mline_path):
                print(f"WARNING: {mline_path} not found, skipping ch{ch}")
                continue

            uade_samples = read_wav_channel(uade_path, 0)  # mono
            mline_samples = read_wav_channel(mline_path, 0)  # mono

            print(f"Samples: UADE={len(uade_samples)}, MLINE={len(mline_samples)}")

            uade_runs = extract_runs(uade_samples)
            mline_runs = extract_runs(mline_samples)

            if not compare_runs(uade_runs, mline_runs, amiga_ch_names[ch]):
                all_pass = False

        if all_pass:
            print("RESULT: PASS (100% value match on all channels)")
        else:
            print("RESULT: FAIL (value mismatch detected)")
            sys.exit(1)
        return

    # Stereo mode (original behavior)
    if not args.uade_wav or not args.mline_wav:
        parser.error("stereo mode requires uade_wav and mline_wav arguments")

    channels = []
    if args.left:
        channels = [(0, 'LEFT')]
    elif args.right:
        channels = [(1, 'RIGHT')]
    else:
        channels = [(0, 'LEFT'), (1, 'RIGHT')]

    print(f"UADE:  {args.uade_wav}")
    print(f"MLINE: {args.mline_wav}")
    print()

    all_pass = True
    for ch_idx, ch_name in channels:
        uade_samples = read_wav_channel(args.uade_wav, ch_idx)
        mline_samples = read_wav_channel(args.mline_wav, ch_idx)

        print(f"Samples: UADE={len(uade_samples)}, MLINE={len(mline_samples)}")

        uade_runs = extract_runs(uade_samples)
        mline_runs = extract_runs(mline_samples)

        if not compare_runs(uade_runs, mline_runs, ch_name):
            all_pass = False

    if all_pass:
        print("RESULT: PASS (100% value match on all channels)")
    else:
        print("RESULT: FAIL (value mismatch detected)")
        sys.exit(1)


if __name__ == '__main__':
    main()
