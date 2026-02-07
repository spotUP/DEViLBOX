#!/usr/bin/env python3
"""
Convert Ensoniq Mirage IFF/8SVX samples to raw PCM for ES5503 wavetable chip.

The ES5503 expects:
- 8-bit unsigned PCM (0x00-0xFF, with 0x80 = center)
- 0x00 is reserved as end-of-sample marker
- 128KB total wave RAM (131,072 bytes)
- Pages 0-7 reserved for built-in waveforms
- Pages 8+ (offset 2048+) for custom data
"""

import os
import struct
import sys
from pathlib import Path
from typing import List, Tuple

def read_iff_chunk(f):
    """Read an IFF chunk header (4-byte ID + 4-byte size)."""
    chunk_id = f.read(4)
    if len(chunk_id) < 4:
        return None, 0
    chunk_size = struct.unpack('>I', f.read(4))[0]
    return chunk_id.decode('ascii', errors='ignore'), chunk_size

def parse_8svx(filepath: Path) -> Tuple[bytes, int, int]:
    """
    Parse IFF/8SVX file and extract PCM data.

    Returns:
        (pcm_data, sample_rate, one_shot_length)
    """
    with open(filepath, 'rb') as f:
        # Read FORM header
        form_id = f.read(4)
        if form_id != b'FORM':
            raise ValueError(f"Not an IFF file: {filepath}")

        form_size = struct.unpack('>I', f.read(4))[0]
        form_type = f.read(4)

        if form_type != b'8SVX':
            raise ValueError(f"Not an 8SVX file: {filepath}")

        # Parse chunks
        pcm_data = None
        sample_rate = 22050  # Default
        one_shot_len = 0

        while True:
            chunk_id, chunk_size = read_iff_chunk(f)
            if chunk_id is None:
                break

            chunk_start = f.tell()

            if chunk_id == 'VHDR':
                # Voice header - contains sample rate and loop info
                one_shot_len = struct.unpack('>I', f.read(4))[0]
                repeat_len = struct.unpack('>I', f.read(4))[0]
                samples_per_cycle = struct.unpack('>I', f.read(4))[0]
                sample_rate = struct.unpack('>H', f.read(2))[0]
                # Skip rest of VHDR

            elif chunk_id == 'BODY':
                # Raw 8-bit signed PCM data
                pcm_data = f.read(chunk_size)

            # Skip to next chunk (IFF chunks are word-aligned)
            f.seek(chunk_start + chunk_size + (chunk_size % 2))

        if pcm_data is None:
            raise ValueError(f"No BODY chunk found in {filepath}")

        return pcm_data, sample_rate, one_shot_len

def signed_to_unsigned(signed_pcm: bytes) -> bytes:
    """Convert 8-bit signed PCM (-128 to +127) to unsigned (0-255)."""
    # Shift by 128: signed 0 -> unsigned 128 (center)
    unsigned = bytearray()
    for byte in signed_pcm:
        # Python bytes are already unsigned (0-255)
        # But IFF/8SVX stores as signed
        signed_value = byte if byte < 128 else byte - 256
        unsigned_value = (signed_value + 128) & 0xFF

        # Avoid 0x00 (reserved as end marker in ES5503)
        if unsigned_value == 0x00:
            unsigned_value = 0x01

        unsigned.append(unsigned_value)

    return bytes(unsigned)

def select_samples(mirage_dir: Path, max_size: int = 126 * 1024) -> List[Tuple[str, bytes]]:
    """
    Select diverse samples from Mirage library that fit in max_size.

    Priority:
    1. Short wavetable-style samples (good for synthesis)
    2. Diverse timbres (piano, strings, brass, bass, synth)
    3. Fit within size limit
    """

    samples = []
    total_size = 0

    # Priority directories for wavetable synthesis
    priority_dirs = [
        'SYNTH_48',      # Synth waveforms
        'DIGITAL1',      # Digital waveforms
        'DIGITAL2',
        'A',             # Piano samples
        'STRINGS1',      # Strings
        'BRASS1',        # Brass
        'BAS-SYN1',      # Bass synth
        'CLASSIC1',      # Classic sounds
    ]

    # Try priority directories first
    for dir_name in priority_dirs:
        dir_path = mirage_dir / dir_name
        if not dir_path.exists():
            continue

        for svx_file in sorted(dir_path.glob('*.8svx')):
            try:
                pcm_signed, sample_rate, one_shot = parse_8svx(svx_file)
                pcm_unsigned = signed_to_unsigned(pcm_signed)

                # Prefer shorter samples (better for wavetables)
                if len(pcm_unsigned) > 32768:  # Skip very long samples
                    continue

                if total_size + len(pcm_unsigned) > max_size:
                    print(f"Size limit reached at {total_size} bytes")
                    return samples

                sample_name = f"{dir_name}/{svx_file.name}"
                samples.append((sample_name, pcm_unsigned))
                total_size += len(pcm_unsigned)

                print(f"Added: {sample_name} - {len(pcm_unsigned)} bytes @ {sample_rate}Hz")

            except Exception as e:
                print(f"Warning: Failed to parse {svx_file}: {e}")
                continue

    return samples

def create_es5503_rom(samples: List[Tuple[str, bytes]], output_file: Path):
    """
    Create ES5503 wave ROM file.

    Format:
    - Pages 0-7 (0x0000-0x07FF): Reserved for built-in waveforms
    - Pages 8+ (0x0800+): Custom sample data
    """

    # Start at page 8 (offset 2048)
    wave_ram = bytearray(2048)  # Reserve first 8 pages

    offset = 2048
    sample_map = []

    for name, pcm_data in samples:
        wave_ram.extend(pcm_data)
        sample_map.append({
            'name': name,
            'offset': offset,
            'size': len(pcm_data),
            'page': offset // 256,
        })
        offset += len(pcm_data)

    # Write ROM file
    with open(output_file, 'wb') as f:
        f.write(wave_ram)

    # Write sample map
    map_file = output_file.with_suffix('.map.txt')
    with open(map_file, 'w') as f:
        f.write("ES5503 Wave ROM Sample Map\n")
        f.write("=" * 60 + "\n\n")
        for entry in sample_map:
            f.write(f"Sample: {entry['name']}\n")
            f.write(f"  Offset: 0x{entry['offset']:04X} ({entry['offset']} bytes)\n")
            f.write(f"  Page:   {entry['page']}\n")
            f.write(f"  Size:   {entry['size']} bytes\n\n")

        f.write(f"\nTotal ROM size: {len(wave_ram)} bytes\n")

    print(f"\nCreated {output_file}: {len(wave_ram)} bytes")
    print(f"Sample map: {map_file}")
    print(f"Total samples: {len(samples)}")

def main():
    script_dir = Path(__file__).parent
    project_root = script_dir.parent

    mirage_dir = project_root / 'public' / 'roms' / 'Mirage4Amiga'
    output_dir = project_root / 'public' / 'roms' / 'es5503'

    if not mirage_dir.exists():
        print(f"Error: Mirage samples not found at {mirage_dir}")
        sys.exit(1)

    output_dir.mkdir(parents=True, exist_ok=True)

    print("Converting Ensoniq Mirage samples to ES5503 format...")
    print(f"Source: {mirage_dir}")
    print(f"Output: {output_dir}")
    print()

    # Select and convert samples
    samples = select_samples(mirage_dir, max_size=126 * 1024)

    if not samples:
        print("Error: No samples selected")
        sys.exit(1)

    # Create ROM file
    rom_file = output_dir / 'es5503_wavetable.bin'
    create_es5503_rom(samples, rom_file)

    print("\n✅ Conversion complete!")
    print(f"\nNext steps:")
    print(f"1. Zip the ROM: cd {output_dir} && zip es5503.zip es5503_wavetable.bin")
    print(f"2. ES5503 will auto-load this ROM on initialization")

if __name__ == '__main__':
    main()
