#!/usr/bin/env python3
"""
Generate BinaryData.h and BinaryData.cpp from Dexed asset files.
Mimics JUCE's juce_add_binary_data() output format.
"""

import os
import sys

ASSETS_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'third-party', 'dexed', 'assets', 'ui')
BUILTIN_PGM = os.path.join(os.path.dirname(__file__), '..', '..', 'third-party', 'dexed', 'assets', 'builtin_pgm.zip')
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), 'stubs')

def sanitize_name(filename):
    """Convert filename to valid C identifier, matching JUCE's BinaryData naming.
    JUCE removes dashes and dots, replacing with nothing for dashes, underscore for dots."""
    # JUCE convention: remove dashes, replace dots with underscores
    name = filename.replace('-', '').replace('.', '_').replace(' ', '_')
    # Ensure it starts with a letter
    if name[0].isdigit():
        name = '_' + name
    return name

def file_to_c_array(filepath):
    """Read binary file and return as list of hex byte strings."""
    with open(filepath, 'rb') as f:
        data = f.read()
    return data

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Collect all asset files
    files = []

    # UI assets (PNG, TTF)
    if os.path.isdir(ASSETS_DIR):
        for fname in sorted(os.listdir(ASSETS_DIR)):
            fpath = os.path.join(ASSETS_DIR, fname)
            if os.path.isfile(fpath) and not fname.startswith('.'):
                # Skip the source/ directory contents
                if fname == 'source':
                    continue
                ext = os.path.splitext(fname)[1].lower()
                if ext in ('.png', '.ttf', '.svg'):
                    files.append((fname, fpath))

    # Builtin programs ZIP
    if os.path.isfile(BUILTIN_PGM):
        files.append(('builtin_pgm.zip', BUILTIN_PGM))

    if not files:
        print("ERROR: No asset files found!", file=sys.stderr)
        sys.exit(1)

    print(f"Generating BinaryData from {len(files)} files...")

    # Generate header
    h_path = os.path.join(OUTPUT_DIR, 'BinaryData.h')
    cpp_path = os.path.join(OUTPUT_DIR, 'BinaryData.cpp')

    with open(h_path, 'w') as h:
        h.write("// BinaryData.h — Auto-generated from Dexed assets\n")
        h.write("// DO NOT EDIT — regenerate with generate_binary_data.py\n")
        h.write("#pragma once\n\n")
        h.write("#include <cstddef>\n\n")
        h.write("namespace BinaryData\n{\n")

        for fname, fpath in files:
            cname = sanitize_name(fname)
            size = os.path.getsize(fpath)
            h.write(f"    extern const char {cname}[];\n")
            h.write(f"    extern const int {cname}Size;\n\n")

        h.write("}\n")

    with open(cpp_path, 'w') as cpp:
        cpp.write("// BinaryData.cpp — Auto-generated from Dexed assets\n")
        cpp.write("// DO NOT EDIT — regenerate with generate_binary_data.py\n\n")
        cpp.write("#include \"BinaryData.h\"\n\n")
        cpp.write("namespace BinaryData\n{\n\n")

        for fname, fpath in files:
            cname = sanitize_name(fname)
            data = file_to_c_array(fpath)
            size = len(data)

            cpp.write(f"// {fname} ({size} bytes)\n")
            cpp.write(f"const char {cname}[] = {{\n")

            # Write hex bytes in rows of 40
            COLS = 40
            for i in range(0, size, COLS):
                chunk = data[i:i+COLS]
                hex_vals = ', '.join(f'0x{b:02x}' for b in chunk)
                if i + COLS < size:
                    cpp.write(f"    {hex_vals},\n")
                else:
                    cpp.write(f"    {hex_vals}\n")

            cpp.write(f"}};\n")
            cpp.write(f"const int {cname}Size = {size};\n\n")

        cpp.write("} // namespace BinaryData\n")

    print(f"Generated {h_path}")
    print(f"Generated {cpp_path}")

    # Print summary
    total_size = sum(os.path.getsize(fpath) for _, fpath in files)
    print(f"Total embedded data: {total_size / 1024:.1f} KB across {len(files)} files")

if __name__ == '__main__':
    main()
