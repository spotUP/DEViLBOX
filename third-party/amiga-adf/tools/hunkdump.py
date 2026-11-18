#!/usr/bin/env python3
"""
hunkdump — Amiga hunk executable format dumper.

Parses and displays the structure of Amiga hunk-format binaries,
with register-write analysis for debugging chipset programming.

Usage:
    python3 tools/hunkdump.py out/amiga_disk/uprough              # dump hunks
    python3 tools/hunkdump.py out/amiga_disk/uprough --hwwrites   # find HW register writes
    python3 tools/hunkdump.py out/amiga_disk/uprough --relocs     # show relocations
    python3 tools/hunkdump.py out/amiga_disk/uprough --hex 0 0x100 # hex dump section

Hunk format spec from rmtew/amiga-reversing knowledge base.
"""

import struct
import sys
import os
import json

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
REG_FILE = os.path.join(PROJECT_ROOT, 'docs', 'amiga-reversing', 'amiga_hw_registers.json')

# Hunk type constants (from amiga_hunk_format.json)
HUNK_HEADER  = 0x3F3
HUNK_CODE    = 0x3E9
HUNK_DATA    = 0x3EA
HUNK_BSS     = 0x3EB
HUNK_RELOC32 = 0x3EC
HUNK_SYMBOL  = 0x3F0
HUNK_DEBUG   = 0x3F1
HUNK_END     = 0x3F2
HUNK_OVERLAY = 0x3F5

HUNK_NAMES = {
    0x3E9: 'HUNK_CODE',    0x3EA: 'HUNK_DATA',     0x3EB: 'HUNK_BSS',
    0x3EC: 'HUNK_RELOC32', 0x3ED: 'HUNK_RELOC16',  0x3EE: 'HUNK_RELOC8',
    0x3EF: 'HUNK_EXT',     0x3F0: 'HUNK_SYMBOL',   0x3F1: 'HUNK_DEBUG',
    0x3F2: 'HUNK_END',     0x3F3: 'HUNK_HEADER',   0x3F4: 'HUNK_UNIT',
    0x3F5: 'HUNK_OVERLAY', 0x3F7: 'HUNK_BREAK',    0x3F8: 'HUNK_DREL32',
    0x3F9: 'HUNK_DREL16',  0x3FA: 'HUNK_DREL8',
}

MEMF_CHIP = 1 << 30
MEMF_FAST = 1 << 31


def read32(data, offset):
    """Read big-endian 32-bit word."""
    if offset + 4 > len(data):
        return None
    return struct.unpack_from('>I', data, offset)[0]


def read16(data, offset):
    """Read big-endian 16-bit word."""
    if offset + 2 > len(data):
        return None
    return struct.unpack_from('>H', data, offset)[0]


def load_hw_registers():
    """Load hardware register database for write analysis."""
    try:
        with open(REG_FILE) as f:
            db = json.load(f)
        regs = {}
        for r in db['registers']:
            addr = int(r['address'].replace('0x', ''), 16)
            regs[addr] = r
        return regs
    except Exception:
        return {}


def parse_hunks(data):
    """Parse the hunk structure of an Amiga executable."""
    offset = 0
    hunks = []

    # Read HUNK_HEADER
    magic = read32(data, offset)
    if magic != HUNK_HEADER:
        print(f"Not a valid hunk file (magic: 0x{magic:08X}, expected 0x{HUNK_HEADER:08X})")
        return None
    offset += 4

    # Resident library names (usually empty)
    while True:
        name_longs = read32(data, offset)
        offset += 4
        if name_longs == 0:
            break
        offset += name_longs * 4  # skip name string

    # Table size, first hunk, last hunk
    table_size = read32(data, offset); offset += 4
    first_hunk = read32(data, offset); offset += 4
    last_hunk = read32(data, offset); offset += 4
    num_hunks = last_hunk - first_hunk + 1

    # Hunk sizes
    hunk_sizes = []
    for i in range(num_hunks):
        size_word = read32(data, offset); offset += 4
        mem_flags = size_word & 0xC0000000
        size_longs = size_word & 0x3FFFFFFF
        mem_type = 'ANY'
        if mem_flags & MEMF_CHIP: mem_type = 'CHIP'
        elif mem_flags & MEMF_FAST: mem_type = 'FAST'
        hunk_sizes.append({'size_longs': size_longs, 'size_bytes': size_longs * 4, 'mem_type': mem_type})

    header = {
        'type': 'HUNK_HEADER',
        'num_hunks': num_hunks,
        'first': first_hunk,
        'last': last_hunk,
        'sizes': hunk_sizes,
    }
    hunks.append(header)

    # Parse remaining hunks
    hunk_idx = 0
    while offset < len(data):
        hunk_type_raw = read32(data, offset)
        if hunk_type_raw is None:
            break
        offset += 4
        hunk_type = hunk_type_raw & 0x3FFFFFFF
        hunk_name = HUNK_NAMES.get(hunk_type, f'UNKNOWN_0x{hunk_type:03X}')

        if hunk_type in (HUNK_CODE, HUNK_DATA):
            size_longs = read32(data, offset); offset += 4
            size_bytes = size_longs * 4
            hunk_data = data[offset:offset + size_bytes]
            offset += size_bytes
            hunks.append({
                'type': hunk_name,
                'index': hunk_idx,
                'size_bytes': size_bytes,
                'offset_in_file': offset - size_bytes,
                'data': hunk_data,
            })
            hunk_idx += 1

        elif hunk_type == HUNK_BSS:
            size_longs = read32(data, offset); offset += 4
            hunks.append({
                'type': hunk_name,
                'index': hunk_idx,
                'size_bytes': size_longs * 4,
            })
            hunk_idx += 1

        elif hunk_type == HUNK_RELOC32:
            relocs = []
            while True:
                count = read32(data, offset); offset += 4
                if count == 0:
                    break
                target_hunk = read32(data, offset); offset += 4
                offsets = []
                for _ in range(count):
                    off = read32(data, offset); offset += 4
                    offsets.append(off)
                relocs.append({'target_hunk': target_hunk, 'count': count, 'offsets': offsets})
            hunks.append({'type': hunk_name, 'relocs': relocs})

        elif hunk_type == HUNK_SYMBOL:
            symbols = []
            while True:
                name_longs = read32(data, offset); offset += 4
                if name_longs == 0:
                    break
                name_bytes = data[offset:offset + name_longs * 4]
                name = name_bytes.rstrip(b'\x00').decode('ascii', errors='replace')
                offset += name_longs * 4
                value = read32(data, offset); offset += 4
                symbols.append({'name': name, 'value': value})
            hunks.append({'type': hunk_name, 'symbols': symbols})

        elif hunk_type == HUNK_DEBUG:
            size_longs = read32(data, offset); offset += 4
            offset += size_longs * 4
            hunks.append({'type': hunk_name, 'size_bytes': size_longs * 4})

        elif hunk_type == HUNK_END:
            hunks.append({'type': hunk_name})

        else:
            hunks.append({'type': hunk_name, 'raw_type': hunk_type_raw})
            break  # Unknown hunk, can't continue

    return hunks


def print_hunks(hunks):
    """Print hunk summary."""
    print(f"\n\033[1mHunk Structure\033[0m")
    print(f"{'='*60}")

    for h in hunks:
        if h['type'] == 'HUNK_HEADER':
            print(f"\n  HUNK_HEADER: {h['num_hunks']} hunks (#{h['first']}..#{h['last']})")
            for i, s in enumerate(h['sizes']):
                print(f"    Hunk #{i}: {s['size_bytes']:>8} bytes  ({s['mem_type']})")

        elif h['type'] in ('HUNK_CODE', 'HUNK_DATA'):
            kind = '📝 CODE' if h['type'] == 'HUNK_CODE' else '📊 DATA'
            print(f"\n  {kind} (hunk #{h['index']}): {h['size_bytes']} bytes"
                  f"  @ file offset 0x{h['offset_in_file']:X}")

        elif h['type'] == 'HUNK_BSS':
            print(f"\n  🔲 BSS (hunk #{h['index']}): {h['size_bytes']} bytes")

        elif h['type'] == 'HUNK_RELOC32':
            total = sum(r['count'] for r in h['relocs'])
            targets = ', '.join(f"#{r['target_hunk']}({r['count']})" for r in h['relocs'])
            print(f"    RELOC32: {total} relocations → {targets}")

        elif h['type'] == 'HUNK_SYMBOL':
            print(f"    SYMBOL: {len(h['symbols'])} symbols")
            for s in h['symbols'][:20]:
                print(f"      0x{s['value']:08X}  {s['name']}")
            if len(h['symbols']) > 20:
                print(f"      ... and {len(h['symbols']) - 20} more")

        elif h['type'] == 'HUNK_DEBUG':
            print(f"    DEBUG: {h['size_bytes']} bytes")

        elif h['type'] == 'HUNK_END':
            pass  # quiet

    print()


def find_hw_writes(hunks, hw_regs):
    """
    Scan code hunks for move.w/move.l to $DFFxxx addresses.

    Looks for common patterns:
    - move.w #imm,$DFFxxx(a5)  (base register + offset)
    - move.w #imm,($DFFxxx).l  (absolute long)
    - lea $DFF000,a5 then move.w dn,offset(a5)
    """
    print(f"\n\033[1mHardware Register Writes (heuristic scan)\033[0m")
    print(f"{'='*60}")

    custom_base = 0xDFF000

    for h in hunks:
        if h['type'] != 'HUNK_CODE' or 'data' not in h:
            continue

        data = h['data']
        print(f"\n  Scanning HUNK_CODE #{h['index']} ({len(data)} bytes)...")
        found = 0

        # Scan for absolute long addressing to $DFFxxx
        # Pattern: xxxx xxxx 00DF Fxxx  (absolute long address in extension words)
        for i in range(0, len(data) - 5, 2):
            # Check for $00DFF in consecutive words
            w0 = read16(data, i)
            w1 = read16(data, i + 2)
            if w0 == 0x00DF and (w1 & 0xF000) == 0xF000:
                offset = w1 & 0x0FFF
                reg = hw_regs.get(offset)
                reg_name = reg['name'] if reg else f'??? (0x{offset:03X})'
                # Look at the instruction before (2 bytes back for opcode)
                if i >= 2:
                    opcode = read16(data, i - 2)
                    print(f"    0x{i - 2:06X}:  abs.l $DFF{offset:03X}  → \033[1;36m{reg_name}\033[0m"
                          f"  (opcode 0x{opcode:04X})")
                    found += 1

        if found == 0:
            print(f"    (no absolute $DFFxxx writes detected)")
        else:
            print(f"    {found} hardware register reference(s)")

    print()


def hex_dump(hunks, hunk_index, start, length):
    """Hex dump a section of a code/data hunk."""
    for h in hunks:
        if h.get('index') == hunk_index and 'data' in h:
            data = h['data']
            end = min(start + length, len(data))
            print(f"\n  Hex dump: hunk #{hunk_index}, offset 0x{start:X}..0x{end:X}")
            print()
            for off in range(start, end, 16):
                hexpart = ' '.join(f'{data[off + j]:02X}' if off + j < end else '  '
                                   for j in range(16))
                ascpart = ''.join(chr(data[off + j]) if off + j < end and 32 <= data[off + j] < 127 else '.'
                                  for j in range(min(16, end - off)))
                print(f"  {off:08X}  {hexpart}  |{ascpart}|")
            print()
            return
    print(f"Hunk #{hunk_index} not found or has no data")


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ('-h', '--help'):
        print(__doc__)
        sys.exit(0)

    filepath = sys.argv[1]
    if not os.path.isfile(filepath):
        print(f"File not found: {filepath}")
        sys.exit(1)

    with open(filepath, 'rb') as f:
        data = f.read()

    print(f"\n  File: {filepath}")
    print(f"  Size: {len(data)} bytes ({len(data) / 1024:.1f} KB)")

    hunks = parse_hunks(data)
    if hunks is None:
        sys.exit(1)

    if '--hwwrites' in sys.argv:
        hw_regs = load_hw_registers()
        if not hw_regs:
            print("Warning: could not load hardware register database")
        find_hw_writes(hunks, hw_regs)
    elif '--relocs' in sys.argv:
        print_hunks(hunks)
    elif '--hex' in sys.argv:
        idx = sys.argv.index('--hex')
        hunk_index = int(sys.argv[idx + 1]) if idx + 1 < len(sys.argv) else 0
        start_str = sys.argv[idx + 2] if idx + 2 < len(sys.argv) else '0'
        start = int(start_str, 0)
        length = int(sys.argv[idx + 3], 0) if idx + 3 < len(sys.argv) else 256
        hex_dump(hunks, hunk_index, start, length)
    else:
        print_hunks(hunks)


if __name__ == '__main__':
    main()
