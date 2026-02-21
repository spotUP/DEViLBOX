#!/usr/bin/env python3
"""
generate_registry.py — Embed all UADE eagleplayer binaries as C arrays.

Usage:
    python3 generate_registry.py

Reads all files from PLAYERS_DIR and writes player_registry.c.
The output is included in the WASM build so all players are available
without filesystem access at runtime.
"""

import os
import sys
import struct

UADE_SRC = os.path.join(os.path.dirname(__file__), '..', 'Reference Code', 'uade-3.05')
PLAYERS_DIR = os.path.join(UADE_SRC, 'players')
OUT_C = os.path.join(os.path.dirname(__file__), 'src', 'player_registry.c')

def sanitize_name(name):
    """Convert a player name to a valid C identifier."""
    result = []
    for c in name:
        if c.isalnum() or c == '_':
            result.append(c)
        else:
            result.append('_')
    return ''.join(result)

def generate():
    if not os.path.isdir(PLAYERS_DIR):
        print(f"ERROR: Players directory not found: {PLAYERS_DIR}", file=sys.stderr)
        print(f"  Expected: {os.path.abspath(PLAYERS_DIR)}", file=sys.stderr)
        sys.exit(1)

    players = []
    for name in sorted(os.listdir(PLAYERS_DIR)):
        path = os.path.join(PLAYERS_DIR, name)
        if os.path.isfile(path):
            with open(path, 'rb') as f:
                data = f.read()
            players.append((name, sanitize_name(name), data))

    print(f"Found {len(players)} eagleplayers in {PLAYERS_DIR}")

    with open(OUT_C, 'w') as out:
        out.write('/*\n')
        out.write(' * player_registry.c — Auto-generated eagleplayer binary registry\n')
        out.write(' *\n')
        out.write(f' * {len(players)} eagleplayers embedded from uade-3.05/players/\n')
        out.write(' *\n')
        out.write(' * DO NOT EDIT MANUALLY — regenerate with: python3 generate_registry.py\n')
        out.write(' */\n\n')
        out.write('#include "player_registry.h"\n\n')

        # Emit each player as a static uint8_t array
        for name, cname, data in players:
            out.write(f'/* {name} — {len(data)} bytes */\n')
            out.write(f'static const uint8_t player_{cname}_data[] = {{\n')

            # Emit bytes in rows of 16
            for i in range(0, len(data), 16):
                chunk = data[i:i+16]
                hex_str = ', '.join(f'0x{b:02x}' for b in chunk)
                out.write(f'    {hex_str},\n')

            out.write('};\n\n')

        # Emit the registry table
        out.write('const UADEPlayer uade_players[] = {\n')
        for name, cname, data in players:
            out.write(f'    {{ "{name}", player_{cname}_data, sizeof(player_{cname}_data) }},\n')
        out.write('};\n\n')

        out.write(f'const int uade_player_count = {len(players)};\n')

    print(f"Written: {OUT_C}")
    print(f"Total embedded player data: {sum(len(d) for _, _, d in players):,} bytes")

if __name__ == '__main__':
    generate()
