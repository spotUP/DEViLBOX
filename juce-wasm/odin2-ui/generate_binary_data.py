#!/usr/bin/env python3
"""
Generate BinaryData.h and BinaryData.cpp from Odin2 assets.

Produces a single BinaryData.h with all extern declarations,
and one BinaryData.cpp per ~50 assets for parallel compilation.

Usage: cd juce-wasm/odin2-ui && python3 generate_binary_data.py
"""

import os
import sys
import re
from pathlib import Path

ODIN2_ROOT = Path(__file__).parent.parent.parent / "third-party" / "odin2-master"
ASSETS_DIR = ODIN2_ROOT / "assets"
GRAPHICS_DIR = ASSETS_DIR / "graphics"
OUTPUT_DIR = Path(__file__).parent / "stubs"

CHUNK_SIZE = 80  # assets per .cpp file
HEX_PER_LINE = 40  # hex bytes per line


def sanitize_name(filename: str) -> str:
    """Convert filename to C identifier (JUCE convention)."""
    name = filename
    # Replace dots with underscores
    name = name.replace('.', '_')
    # Replace non-alphanumeric with underscore
    name = re.sub(r'[^a-zA-Z0-9_]', '_', name)
    # Collapse multiple underscores
    name = re.sub(r'_+', '_', name)
    # Strip leading underscore or digit
    name = re.sub(r'^[_0-9]+', '', name)
    return name


def collect_assets():
    """Collect all asset files that need to be in BinaryData."""
    assets = []

    # 1. All PNGs from graphics/ (matching create_graphics_headers.sh behavior)
    for png in sorted(GRAPHICS_DIR.rglob("*.png")):
        # Exclude the "12" directory if it exists (as the script does)
        if "/12/" in str(png):
            continue
        cname = sanitize_name(png.stem + ".png")  # e.g., knob_4x4_a_0000_png
        assets.append((png, cname))

    # 2. spline_ad.png from assets/ root (also referenced as a PNG in UIAssetsData)
    spline = ASSETS_DIR / "spline_ad.png"
    if spline.exists():
        cname = sanitize_name("spline_ad.png")
        # Check if already added from graphics/
        if not any(a[1] == cname for a in assets):
            assets.append((spline, cname))

    # 3. Font
    font = ASSETS_DIR / "font" / "aldrich_regular.ttf"
    if font.exists():
        assets.append((font, sanitize_name("aldrich_regular.ttf")))

    # 4. GuiData.json
    guidata = ASSETS_DIR / "GuiData.json"
    if guidata.exists():
        assets.append((guidata, sanitize_name("GuiData.json")))

    # 5. init_patch.odin
    init_patch = ASSETS_DIR / "init_patch.odin"
    if init_patch.exists():
        assets.append((init_patch, sanitize_name("init_patch.odin")))

    return assets


def write_header(assets, outpath):
    """Write BinaryData.h with all extern declarations."""
    with open(outpath, 'w') as f:
        f.write("// BinaryData.h — Auto-generated from Odin2 assets\n")
        f.write("// Do not edit by hand\n\n")
        f.write("#pragma once\n\n")
        f.write("namespace BinaryData {\n\n")
        for _, cname in assets:
            f.write(f"    extern const char {cname}[];\n")
            f.write(f"    extern const int  {cname}Size;\n\n")

        # namedResourceListSize (used by some JUCE code)
        f.write(f"    inline int namedResourceListSize = {len(assets)};\n\n")
        f.write("}\n")


def write_cpp_chunk(assets_chunk, chunk_idx, outdir):
    """Write one BinaryData_NNN.cpp chunk."""
    outpath = outdir / f"BinaryData_{chunk_idx:03d}.cpp"
    with open(outpath, 'w') as f:
        f.write(f"// BinaryData_{chunk_idx:03d}.cpp — Auto-generated chunk {chunk_idx}\n")
        f.write("#include \"BinaryData.h\"\n\n")
        f.write("namespace BinaryData {\n\n")

        for filepath, cname in assets_chunk:
            data = filepath.read_bytes()
            size = len(data)

            # Write the array
            f.write(f"const char {cname}[] = {{\n    ")
            for i, byte in enumerate(data):
                if i > 0 and i % HEX_PER_LINE == 0:
                    f.write("\n    ")
                f.write(f"0x{byte:02x},")
            f.write("\n};\n")
            f.write(f"const int {cname}Size = {size};\n\n")

        f.write("} // namespace BinaryData\n")
    return outpath


def main():
    print("Collecting Odin2 assets...")
    assets = collect_assets()
    print(f"Found {len(assets)} assets")

    total_bytes = sum(p.stat().st_size for p, _ in assets)
    print(f"Total size: {total_bytes / 1024 / 1024:.1f} MB")

    # Write header
    header_path = OUTPUT_DIR / "BinaryData.h"
    write_header(assets, header_path)
    print(f"Wrote {header_path}")

    # Write chunked .cpp files
    cpp_files = []
    for i in range(0, len(assets), CHUNK_SIZE):
        chunk = assets[i:i + CHUNK_SIZE]
        chunk_idx = i // CHUNK_SIZE
        cpp_path = write_cpp_chunk(chunk, chunk_idx, OUTPUT_DIR)
        cpp_files.append(cpp_path)
        print(f"  Wrote {cpp_path.name} ({len(chunk)} assets)")

    print(f"\nGenerated {len(cpp_files)} .cpp chunks")
    print("Done!")


if __name__ == "__main__":
    main()
