#!/bin/bash
# Extract sound chip ROMs from MAME game ROMs
# and organize them into chip-specific directories

set -e

ROMS_DIR="/Users/spot/Code/DEViLBOX/public/roms"
TEMP_DIR="/tmp/devilbox-rom-extraction"

echo "🎮 DEViLBOX Sound ROM Extractor"
echo "================================"
echo ""

# Create temp directory
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"

# ============================================================================
# C352 - Namco System 11/12/22/23
# ============================================================================
echo "📦 Extracting C352 (Namco) ROMs..."

extract_c352() {
    local game=$1
    local romfile=$2

    if [ -f "$ROMS_DIR/$game.zip" ]; then
        echo "  - Processing $game..."
        unzip -j "$ROMS_DIR/$game.zip" "$romfile" -d "$TEMP_DIR/c352/" 2>/dev/null || true
    fi
}

mkdir -p "$TEMP_DIR/c352"

# Extract C352 wave ROMs from various games
extract_c352 "tekken2" "tes1wave.8k"
extract_c352 "soulclbr" "soc1wave.8k"
extract_c352 "timecris" "ts1wavea.2l"

# Combine all C352 ROMs into one package
if [ -n "$(ls -A $TEMP_DIR/c352 2>/dev/null)" ]; then
    cd "$TEMP_DIR/c352"
    # Rename to generic names
    count=0
    for file in *; do
        cp "$file" "c352_samples_${count}.bin"
        ((count++))
    done

    zip -q "$ROMS_DIR/c352/c352.zip" c352_samples_*.bin
    echo "  ✓ Created c352.zip with $count sample files"
fi

# ============================================================================
# K054539 - Konami
# ============================================================================
echo "📦 Extracting K054539 (Konami) ROMs..."

extract_k054539() {
    local game=$1
    shift
    local romfiles=("$@")

    if [ -f "$ROMS_DIR/$game.zip" ]; then
        echo "  - Processing $game..."
        for romfile in "${romfiles[@]}"; do
            unzip -j "$ROMS_DIR/$game.zip" "$romfile" -d "$TEMP_DIR/k054539/" 2>/dev/null || true
        done
    fi
}

mkdir -p "$TEMP_DIR/k054539"

# Extract K054539 PCM ROMs from various games
extract_k054539 "xexex" "067b06.3e" "067b07.1e"
extract_k054539 "viostorm" "168a07.1h" "168a08.1k"
extract_k054539 "mystwarr" "128a08.1h"

# Combine all K054539 ROMs
if [ -n "$(ls -A $TEMP_DIR/k054539 2>/dev/null)" ]; then
    cd "$TEMP_DIR/k054539"
    count=0
    for file in *; do
        cp "$file" "k054539_samples_${count}.bin"
        ((count++))
    done

    zip -q "$ROMS_DIR/k054539/k054539.zip" k054539_samples_*.bin
    echo "  ✓ Created k054539.zip with $count sample files"
fi

# ============================================================================
# ICS2115 - Raiden Series
# ============================================================================
echo "📦 Extracting ICS2115 (Raiden) ROMs..."

extract_ics2115() {
    local game=$1
    local romfile=$2

    if [ -f "$ROMS_DIR/$game.zip" ]; then
        echo "  - Processing $game..."
        unzip -j "$ROMS_DIR/$game.zip" "$romfile" -d "$TEMP_DIR/ics2115/" 2>/dev/null || true
    fi
}

mkdir -p "$TEMP_DIR/ics2115"

# Extract ICS2115 PCM ROMs
extract_ics2115 "raiden2" "raiden_2_pcm.u1018"
extract_ics2115 "rfjet" "rfj_pcm.u1018"

# Combine all ICS2115 ROMs
if [ -n "$(ls -A $TEMP_DIR/ics2115 2>/dev/null)" ]; then
    cd "$TEMP_DIR/ics2115"
    count=0
    for file in *; do
        cp "$file" "ics2115_wavetable_${count}.bin"
        ((count++))
    done

    zip -q "$ROMS_DIR/ics2115/ics2115.zip" ics2115_wavetable_*.bin
    echo "  ✓ Created ics2115.zip with $count wavetable files"
fi

# ============================================================================
# RF5C400 - Konami Bemani (Firebeat)
# ============================================================================
echo "📦 Extracting RF5C400 (Bemani) ROMs..."

extract_rf5c400() {
    local game=$1
    shift
    local romfiles=("$@")

    if [ -f "$ROMS_DIR/$game.zip" ]; then
        echo "  - Processing $game..."
        for romfile in "${romfiles[@]}"; do
            unzip -j "$ROMS_DIR/$game.zip" "$romfile" -d "$TEMP_DIR/rf5c400/" 2>/dev/null || true
        done
    fi
}

mkdir -p "$TEMP_DIR/rf5c400"

# Extract RF5C400 sample ROMs from Bemani games
# Note: Bemani games typically have sound data in specific files
extract_rf5c400 "bm1stmix" "977jaa05.bin" "977jaa06.bin"
extract_rf5c400 "popn1" "*pcm*.bin" "*snd*.bin"
extract_rf5c400 "gtrfrks" "*pcm*.bin" "*snd*.bin"

# Combine all RF5C400 ROMs
if [ -n "$(ls -A $TEMP_DIR/rf5c400 2>/dev/null)" ]; then
    cd "$TEMP_DIR/rf5c400"
    count=0
    for file in *; do
        cp "$file" "rf5c400_samples_${count}.bin"
        ((count++))
    done

    zip -q "$ROMS_DIR/rf5c400/rf5c400.zip" rf5c400_samples_*.bin
    echo "  ✓ Created rf5c400.zip with $count sample files"
fi

# ============================================================================
# Cleanup
# ============================================================================
echo ""
echo "🧹 Cleaning up..."
rm -rf "$TEMP_DIR"

echo ""
echo "✅ Sound ROM extraction complete!"
echo ""
echo "📁 Created ROM packages:"
[ -f "$ROMS_DIR/c352/c352.zip" ] && echo "  ✓ c352.zip       → /public/roms/c352/"
[ -f "$ROMS_DIR/k054539/k054539.zip" ] && echo "  ✓ k054539.zip    → /public/roms/k054539/"
[ -f "$ROMS_DIR/ics2115/ics2115.zip" ] && echo "  ✓ ics2115.zip    → /public/roms/ics2115/"
[ -f "$ROMS_DIR/rf5c400/rf5c400.zip" ] && echo "  ✓ rf5c400.zip    → /public/roms/rf5c400/"
echo ""
echo "🎯 Next steps:"
echo "  1. Test each synth in DEViLBOX"
echo "  2. Check browser console for 'ROM loaded successfully'"
echo "  3. Try playing notes to verify sound output"
