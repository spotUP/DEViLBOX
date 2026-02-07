# MAME Sound Chip ROM Files

This directory contains ROM dumps for MAME sound chips that require sample data.

## ROM File Formats

**Preferred:** MAME-style `.zip` files (standard MAME ROM format)
**Also supported:** Individual `.bin` files or combined `.bin` files

Following MAME convention, ROM sets can be provided as zipped archives. The loader will automatically:
1. Try `{chipname}.zip` first (MAME standard)
2. Fall back to combined `{chipname}_combined.bin`
3. Fall back to individual ROM files

## Directory Structure

```
public/roms/
├── tr707/           # Roland TR-707 drum machine
├── sp0250/          # GI SP0250 speech chip
├── tms5220/         # TI TMS5220 speech chip
├── votrax/          # Votrax speech chip
├── ics2115/         # ICS2115 wavetable synth
├── k054539/         # Konami K054539 PCM
├── c352/            # Namco C352 PCM
├── rf5c400/         # Ricoh RF5C400 PCM
└── roland_sa/       # Roland sound module
```

## Required ROM Files

### TR-707 (Roland TR-707 Drum Machine)
**Location:** `/public/roms/tr707/`

**Standard ROMs:**

**Option 1: ZIP file (MAME standard - recommended)**
- `tr707.zip` - Contains all standard ROM files
  - `tr707_voices.bin` (64KB) - IC34+IC35: Bass, snare, toms, rimshot, handclap
  - `tr707_crash.bin` (32KB) - IC19: Crash cymbal
  - `tr707_ride.bin` (32KB) - IC22: Ride cymbal

**Option 2: Combined ROM**
- `tr707_combined.bin` (128KB total)
  - Contains all standard drum samples in one file

**Option 3: Individual ROMs**
- `tr707_voices.bin` (64KB)
- `tr707_crash.bin` (32KB)
- `tr707_ride.bin` (32KB)

**Expansion ROM (Optional):**
- `tr707_expansion.zip` - HKA expansion as ZIP, OR:
- `tr707_expansion.bin` (256KB) - [HKA TR-707 Expansion](https://hkadesign.org.uk/tr707expansion.html)
  - Adds extra sounds beyond standard TR-707
  - Automatically detected if present
  - Falls back to standard ROM if not found

### SP0250 (Speech Synthesis)
**Location:** `/public/roms/sp0250/`
- `sp0250.zip` (MAME standard), OR:
- `sp0250.bin` (16KB) - Allophone data

### TMS5220 (TI Speech Chip)
**Location:** `/public/roms/tms5220/`
- `tms5220.zip` (MAME standard), OR:
- `tms5220.vsm` - Voice synthesis memory

### Votrax (Speech Synthesis)
**Location:** `/public/roms/votrax/`
- `votrax.zip` (MAME standard), OR:
- `votrax.bin` - Speech ROM data

### ICS2115 (Wavetable Synthesizer)
**Location:** `/public/roms/ics2115/`
- `ics2115.zip` (MAME standard), OR:
- `ics2115_wavetable.bin` - Wavetable ROM (up to 16MB)
- Compatible with Gravis UltraSound ROM format

### K054539 (Konami PCM)
**Location:** `/public/roms/k054539/`
- `k054539.zip` (MAME standard - varies by game), OR:
- `k054539_samples.bin` - Sample ROM (up to 16MB)
- Varies by Konami arcade game

### C352 (Namco PCM)
**Location:** `/public/roms/c352/`
- `c352.zip` (MAME standard - varies by game), OR:
- `c352_samples.bin` - Sample ROM (typically 2-8MB)
- Varies by Namco arcade game (System 11/12/22/23)

### RF5C400 (Ricoh PCM)
**Location:** `/public/roms/rf5c400/`
- `rf5c400.zip` (MAME standard - varies by game), OR:
- `rf5c400_samples.bin` - Sample ROM (typically 2-8MB)
- Sega ST-V, Saturn arcade ports

### Roland SA (Roland Sound Module)
**Location:** `/public/roms/roland_sa/`
- `roland_sa.zip` (MAME standard), OR:
- Individual files:
  - `roland_sa_ic5.bin` (128KB) - Wave ROM IC5
  - `roland_sa_ic6.bin` (128KB) - Wave ROM IC6
  - `roland_sa_ic7.bin` (128KB) - Wave ROM IC7
- Total: 384KB

## How to Obtain ROM Files

### Legal Methods:
1. **Dump from your own hardware** - If you own the original device
2. **Purchase licensed ROM sets** - Some vendors sell legal ROM collections
3. **Use homebrew/open-source alternatives** - Community-created replacements

### Important Notes:
- ⚠️ **ROM files are copyrighted** - Only use ROMs you legally own
- 🔒 **This repository does NOT include ROM files** - You must provide your own
- 📜 **Check local laws** - ROM dumping legality varies by jurisdiction

## File Format

**Preferred format:** `.zip` files following MAME naming conventions
- Standard MAME ROM sets work out of the box
- Automatically extracts and loads individual ROM files
- Consistent with MAME emulation community standards

**Alternative formats:**
- Raw binary data (`.bin` files)
- **Endianness:** Little-endian (as stored in original chips)
- **No headers:** Pure ROM dump, no file format wrappers

**ZIP file structure:**
- ROM files should be stored uncompressed or with standard ZIP compression
- File names inside ZIP must match the expected ROM file names (e.g., `tr707_voices.bin`)
- Multiple ROM files can be combined in a single ZIP archive

## Verification

After placing ROM files, check the browser console for:
```
✓ Loaded TR-707 combined ROM: 131072 bytes
✓ Loaded sp0250.bin: 16384 bytes
```

If ROMs fail to load:
```
[TR707] ROM loading failed: Failed to load TR-707 voices ROM
```

Check:
1. Files are in the correct directory
2. Filenames match exactly (case-sensitive)
3. File sizes match expected sizes
4. Files are not corrupted

## Testing

After adding ROM files:
1. Hard refresh the page (Cmd+Shift+R / Ctrl+Shift+R)
2. Create a synth instance (e.g., TR707)
3. Play a note - you should hear drum sounds
4. Check console for "[chipname] ROM loaded successfully"

## Without ROM Files

Synths will initialize but produce no audio:
- TR707: Silent (no drum samples)
- SP0250/TMS5220/Votrax: Silent (no speech)
- Others: May work with reduced functionality

## Questions?

See the main documentation or check:
- `/src/engine/mame/MAMEROMLoader.ts` - ROM loading code
- `/docs/MAME_CHIPS_BUILD_STATUS.md` - Chip status and requirements
