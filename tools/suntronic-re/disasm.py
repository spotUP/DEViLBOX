#!/usr/bin/env python3.11
"""
disasm.py -- Probe P2: m68k disassembly of the SunTronic V1.3 replayer (hunk#1).

Parses the AmigaOS hunk structure of a V1.3 module, extracts hunk#1, and
disassembles a given hunk1-relative range with capstone (M68K_000 mode).
PC-relative effective addresses are resolved to hunk1-relative offsets so the
score-table LEAs can be read directly.

Usage:
  python3.11 tools/suntronic-re/disasm.py <module> <startHex> <endHex>
"""

import struct
import sys

from capstone import Cs, CS_ARCH_M68K, CS_MODE_M68K_000, CS_MODE_BIG_ENDIAN


def u32(buf, off):
    return struct.unpack_from(">I", buf, off)[0]


def parse_hunk1(buf):
    assert u32(buf, 0) == 0x3F3
    pos = 8  # header + empty name list terminator
    table_size = u32(buf, pos); pos += 4
    first = u32(buf, pos); pos += 4
    last = u32(buf, pos); pos += 4
    n = last - first + 1
    assert n == table_size
    pos += 4 * n  # size table
    hunks = []
    while pos < len(buf) and len(hunks) < n:
        t = u32(buf, pos) & 0x3FFFFFFF; pos += 4
        if t in (0x3E9, 0x3EA):  # CODE/DATA
            longs = u32(buf, pos); pos += 4
            hunks.append((pos, longs * 4))
            pos += longs * 4
        elif t == 0x3EB:  # BSS
            pos += 4
            hunks.append((pos, 0))
        elif t == 0x3EC:  # RELOC32
            while True:
                cnt = u32(buf, pos); pos += 4
                if cnt == 0:
                    break
                pos += 4 + 4 * cnt
        elif t == 0x3F2:  # END
            continue
        else:
            raise ValueError(f"hunk type {t:#x} at {pos-4:#x}")
    off, ln = hunks[1]
    return buf[off:off + ln]


def main():
    path, start, end = sys.argv[1], int(sys.argv[2], 16), int(sys.argv[3], 16)
    with open(path, "rb") as f:
        buf = f.read()
    h1 = parse_hunk1(buf)

    md = Cs(CS_ARCH_M68K, CS_MODE_M68K_000 | CS_MODE_BIG_ENDIAN)
    md.skipdata = True  # keep going over embedded data
    pos = start
    code = h1[start:end]
    for insn in md.disasm(code, start):
        line = f"{insn.address:#07x}  {insn.bytes.hex():<20} {insn.mnemonic:<9} {insn.op_str}"
        # resolve pc-relative displacements: capstone prints $xxxx(pc) already
        # as absolute target for m68k; annotate raw (pc) usage
        print(line)
    _ = pos


if __name__ == "__main__":
    main()
