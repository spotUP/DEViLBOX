#!/usr/bin/env python3
"""
Post-assembly fixup: set CHIP memory flag (bit 30) on HUNK_DATA type words.

vasm's hunkexe output puts CHIP flags only in the header size table,
but the original MusiclineEditor binary has it on the hunk type word too.
This script patches the assembled binary to match.
"""

import struct
import sys


def fixup(filepath):
    with open(filepath, 'rb') as f:
        data = bytearray(f.read())

    pos = 0

    def read_long(p):
        return struct.unpack_from('>I', data, p)[0], p + 4

    # HUNK_HEADER
    magic, pos = read_long(pos)
    assert magic == 0x3F3

    # Skip resident library names
    while True:
        name_len, pos = read_long(pos)
        if name_len == 0:
            break
        pos += name_len * 4

    num_hunks, pos = read_long(pos)
    first_hunk, pos = read_long(pos)
    last_hunk, pos = read_long(pos)

    # Read hunk size table to find which hunks have CHIP flag
    chip_hunks = set()
    for i in range(num_hunks):
        raw, pos = read_long(pos)
        if raw & 0x40000000:  # CHIP flag
            chip_hunks.add(i)

    if not chip_hunks:
        print("No CHIP hunks found, nothing to fix.")
        return

    # Walk through hunk bodies and fix DATA/CODE type words
    hunk_idx = 0
    patched = 0
    while pos < len(data):
        hunk_type_raw, _ = read_long(pos)
        hunk_type = hunk_type_raw & 0x3FFFFFFF

        if hunk_type in (0x3E9, 0x3EA):  # HUNK_CODE or HUNK_DATA
            if hunk_idx in chip_hunks and not (hunk_type_raw & 0x40000000):
                # Set CHIP flag
                struct.pack_into('>I', data, pos, hunk_type_raw | 0x40000000)
                print(f"  Patched hunk {hunk_idx} at offset 0x{pos:x}: "
                      f"0x{hunk_type_raw:08x} -> 0x{hunk_type_raw | 0x40000000:08x}")
                patched += 1
            pos += 4
            size, pos = read_long(pos)
            pos += size * 4

        elif hunk_type == 0x3EB:  # HUNK_BSS
            if hunk_idx in chip_hunks and not (hunk_type_raw & 0x40000000):
                struct.pack_into('>I', data, pos, hunk_type_raw | 0x40000000)
                print(f"  Patched hunk {hunk_idx} at offset 0x{pos:x}: "
                      f"0x{hunk_type_raw:08x} -> 0x{hunk_type_raw | 0x40000000:08x}")
                patched += 1
            pos += 4
            _, pos = read_long(pos)

        elif hunk_type == 0x3EC:  # HUNK_RELOC32
            pos += 4
            while True:
                count, pos = read_long(pos)
                if count == 0:
                    break
                _, pos = read_long(pos)  # target hunk
                pos += count * 4

        elif hunk_type == 0x3F2:  # HUNK_END
            pos += 4
            hunk_idx += 1

        else:
            break

    if patched:
        with open(filepath, 'wb') as f:
            f.write(data)
        print(f"Fixed {patched} hunk(s).")
    else:
        print("No fixups needed.")


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <binary>")
        sys.exit(1)
    fixup(sys.argv[1])
