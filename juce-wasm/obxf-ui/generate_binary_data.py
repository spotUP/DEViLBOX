#!/usr/bin/env python3
"""Generate BinaryData.h/cpp from OB-Xf binary assets for WASM build.
Matches JUCE BinaryData naming: dashes removed, dots→underscores, filename only (no dir prefix)."""

import os
import sys
import re

ASSET_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'third-party', 'OB-Xf-main', 'assets', 'binary')
OUT_DIR = os.path.join(os.path.dirname(__file__), 'stubs')

def sanitize_name(filename):
    """Convert filename to valid C identifier matching JUCE convention.
    Dashes are REMOVED (not replaced). Dots and other non-alnum → underscore."""
    name = filename
    name = name.replace('-', '')       # JUCE removes dashes
    name = name.replace('@', '_')      # @ → underscore
    name = re.sub(r'[^a-zA-Z0-9_]', '_', name)  # other non-alnum → underscore
    name = re.sub(r'_+', '_', name)    # collapse multiple underscores
    name = name.strip('_')
    if name and name[0].isdigit():
        name = '_' + name
    return name

def collect_assets(base_dir):
    """Collect all asset files recursively. Uses filename only for C name."""
    assets = []
    for root, dirs, files in os.walk(base_dir):
        for f in sorted(files):
            filepath = os.path.join(root, f)
            relpath = os.path.relpath(filepath, base_dir)
            cname = sanitize_name(f)  # filename only, no directory prefix
            assets.append((cname, filepath, relpath))
    return assets

def main():
    if not os.path.isdir(ASSET_DIR):
        print(f"Error: Asset directory not found: {ASSET_DIR}", file=sys.stderr)
        sys.exit(1)

    entries = collect_assets(ASSET_DIR)
    # Deduplicate: if same cname from different dirs, keep first
    seen = {}
    deduped = []
    for cname, filepath, relpath in entries:
        if cname not in seen:
            seen[cname] = relpath
            deduped.append((cname, filepath, relpath))
        else:
            print(f"  WARNING: duplicate name '{cname}' from '{relpath}' (already have '{seen[cname]}')")
    entries = deduped
    print(f"Found {len(entries)} unique assets to embed")

    os.makedirs(OUT_DIR, exist_ok=True)

    # Write BinaryData.h
    h_path = os.path.join(OUT_DIR, 'BinaryData.h')
    with open(h_path, 'w') as hf:
        hf.write("// BinaryData.h — Auto-generated from OB-Xf assets\n")
        hf.write("// DO NOT EDIT — regenerate with generate_binary_data.py\n")
        hf.write("#pragma once\n\n")
        hf.write("#include <cstddef>\n\n")
        hf.write("namespace BinaryData\n{\n")
        for cname, filepath, relpath in entries:
            hf.write(f"    extern const char {cname}[];\n")
            hf.write(f"    extern const int {cname}Size;\n\n")
        hf.write("    // Runtime lookup (used by ScalingImageCache)\n")
        hf.write("    const char* getNamedResource(const char* name, int& size);\n")
        hf.write(f"    inline int namedResourceListSize = {len(entries)};\n")
        hf.write("}\n")

    # Write BinaryData.cpp
    cpp_path = os.path.join(OUT_DIR, 'BinaryData.cpp')
    with open(cpp_path, 'w') as cf:
        cf.write("// BinaryData.cpp — Auto-generated from OB-Xf assets\n")
        cf.write("// DO NOT EDIT — regenerate with generate_binary_data.py\n\n")
        cf.write("#include \"BinaryData.h\"\n")
        cf.write("#include <cstring>\n\n")
        cf.write("namespace BinaryData\n{\n\n")

        for cname, filepath, relpath in entries:
            data = open(filepath, 'rb').read()
            size = len(data)
            cf.write(f"// {relpath} ({size} bytes)\n")
            cf.write(f"const char {cname}[] = {{\n")
            for i in range(0, size, 40):
                chunk = data[i:i+40]
                hex_bytes = ', '.join(f'0x{b:02x}' for b in chunk)
                cf.write(f"    {hex_bytes},\n")
            cf.write("};\n")
            cf.write(f"const int {cname}Size = {size};\n\n")

        # Generate getNamedResource lookup
        cf.write("// Runtime name-to-resource lookup\n")
        cf.write("const char* getNamedResource(const char* name, int& size)\n{\n")
        for cname, filepath, relpath in entries:
            cf.write(f"    if (std::strcmp(name, \"{cname}\") == 0) {{ size = {cname}Size; return {cname}; }}\n")
        cf.write("    size = 0;\n")
        cf.write("    return nullptr;\n")
        cf.write("}\n\n")

        cf.write("} // namespace BinaryData\n")

    # Print summary
    total_bytes = sum(os.path.getsize(fp) for _, fp, _ in entries)
    print(f"Generated {h_path} and {cpp_path}")
    print(f"Total embedded data: {total_bytes:,} bytes ({total_bytes/1024:.1f} KB)")
    print(f"Entries: {len(entries)}")

    # Print name mapping for debugging
    for cname, filepath, relpath in entries:
        print(f"  {relpath} -> {cname}")

if __name__ == '__main__':
    main()
