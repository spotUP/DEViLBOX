#!/usr/bin/env python3.11
"""disasm-raw.py -- disassemble a raw memory dump (from p8a-dump-calc3-bin.ts)
at a given base address. Bytes are verbatim live memory, NOT a hunk file.

Usage: python3.11 tools/suntronic-re/disasm-raw.py <bin> <baseHex>
"""
import sys
from capstone import Cs, CS_ARCH_M68K, CS_MODE_M68K_000, CS_MODE_BIG_ENDIAN

path, base = sys.argv[1], int(sys.argv[2], 16)
with open(path, "rb") as f:
    code = f.read()
md = Cs(CS_ARCH_M68K, CS_MODE_M68K_000 | CS_MODE_BIG_ENDIAN)
md.skipdata = True
for insn in md.disasm(code, base):
    print(f"{insn.address:#08x}  {insn.bytes.hex():<20} {insn.mnemonic:<9} {insn.op_str}")
