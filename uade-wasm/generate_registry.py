#!/usr/bin/env python3
"""
generate_registry.py — Embed all UADE eagleplayer binaries and basedir files as C arrays.

Usage:
    python3 generate_registry.py

Reads all files from PLAYERS_DIR and writes player_registry.c.
Also reads basedir config/data files and writes basedir_data.c.
The output is included in the WASM build so all players and config
are available without filesystem access at runtime.
"""

import os
import sys
import struct

UADE_SRC = os.path.join(os.path.dirname(__file__), '..', 'Reference Code', 'uade-3.05')
PLAYERS_DIR = os.path.join(UADE_SRC, 'players')
OUT_C = os.path.join(os.path.dirname(__file__), 'src', 'player_registry.c')
OUT_BASEDIR_C = os.path.join(os.path.dirname(__file__), 'src', 'basedir_data.c')

# Basedir files to embed (relative to UADE_SRC, mapped to MEMFS filename)
BASEDIR_FILES = [
    ('uaerc',                           'uaerc'),           # UAE emulator config
    ('uade.conf.in',                    'uade.conf'),       # UADE config (template → actual)
    ('eagleplayer.conf',                'eagleplayer.conf'),# Player detection rules
    ('amigasrc/score/score',            'score'),           # 68k score binary
]

def sanitize_name(name):
    """Convert a player name to a valid C identifier."""
    result = []
    for c in name:
        if c.isalnum() or c == '_':
            result.append(c)
        else:
            result.append('_')
    return ''.join(result)

def emit_binary_array(out, varname, data):
    """Write a binary blob as a C uint8_t array."""
    out.write(f'static const uint8_t {varname}[] = {{\n')
    for i in range(0, len(data), 16):
        chunk = data[i:i+16]
        hex_str = ', '.join(f'0x{b:02x}' for b in chunk)
        out.write(f'    {hex_str},\n')
    out.write('};\n\n')

def generate_player_registry():
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
            emit_binary_array(out, f'player_{cname}_data', data)

        # Emit the registry table
        out.write('const UADEPlayer uade_players[] = {\n')
        for name, cname, data in players:
            out.write(f'    {{ "{name}", player_{cname}_data, sizeof(player_{cname}_data) }},\n')
        out.write('};\n\n')

        out.write(f'const int uade_player_count = {len(players)};\n')

    print(f"Written: {OUT_C}")
    print(f"Total embedded player data: {sum(len(d) for _, _, d in players):,} bytes")

def generate_basedir_data():
    files = []
    for src_rel, memfs_name in BASEDIR_FILES:
        src_path = os.path.join(UADE_SRC, src_rel)
        if not os.path.isfile(src_path):
            print(f"WARNING: Basedir file not found: {src_path}", file=sys.stderr)
            continue
        with open(src_path, 'rb') as f:
            data = f.read()
        cname = sanitize_name(memfs_name)
        files.append((memfs_name, cname, data))
        print(f"  Embedded basedir file: {memfs_name} ({len(data):,} bytes)")

    with open(OUT_BASEDIR_C, 'w') as out:
        out.write('/*\n')
        out.write(' * basedir_data.c — Auto-generated UADE basedir files\n')
        out.write(' *\n')
        out.write(f' * {len(files)} basedir files embedded from uade-3.05/\n')
        out.write(' *\n')
        out.write(' * DO NOT EDIT MANUALLY — regenerate with: python3 generate_registry.py\n')
        out.write(' */\n\n')
        out.write('#include "basedir_data.h"\n\n')

        # Emit each file as a static uint8_t array
        for memfs_name, cname, data in files:
            out.write(f'/* {memfs_name} — {len(data)} bytes */\n')
            emit_binary_array(out, f'basedir_{cname}_data', data)

        # Emit the registry table
        out.write('const UADEBasedirFile uade_basedir_files[] = {\n')
        for memfs_name, cname, data in files:
            out.write(f'    {{ "{memfs_name}", basedir_{cname}_data, sizeof(basedir_{cname}_data) }},\n')
        out.write('};\n\n')

        out.write(f'const int uade_basedir_file_count = {len(files)};\n')

    print(f"Written: {OUT_BASEDIR_C}")
    print(f"Total embedded basedir data: {sum(len(d) for _, _, d in files):,} bytes")

if __name__ == '__main__':
    generate_player_registry()
    print()
    print("Generating basedir data...")
    generate_basedir_data()
