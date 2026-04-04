#!/bin/bash
# build-all-wasm.sh — Build all (or specific) WASM modules
#
# Usage:
#   scripts/build-all-wasm.sh              # Build all modules
#   scripts/build-all-wasm.sh furnace      # Build only furnace-wasm
#   scripts/build-all-wasm.sh -j4          # Build with 4 parallel make jobs
#   scripts/build-all-wasm.sh --list       # List all modules
#   scripts/build-all-wasm.sh --clean      # Clean all build dirs before building
#   scripts/build-all-wasm.sh --dry-run    # Show what would be built

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Defaults
JOBS=""
CLEAN=0
DRY_RUN=0
FILTER=""
LIST_ONLY=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
NC='\033[0m'

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    -j*)     JOBS="$1"; shift ;;
    --clean) CLEAN=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --list)  LIST_ONLY=1; shift ;;
    --help|-h)
      echo "Usage: $0 [OPTIONS] [MODULE_FILTER]"
      echo ""
      echo "Options:"
      echo "  -jN        Parallel make jobs (e.g., -j4)"
      echo "  --clean    Remove build dirs before building"
      echo "  --dry-run  Show what would be built without building"
      echo "  --list     List all buildable modules"
      echo "  --help     Show this help"
      echo ""
      echo "MODULE_FILTER: substring to match module names (e.g., 'furnace', 'hively')"
      exit 0
      ;;
    *)       FILTER="$1"; shift ;;
  esac
done

# ── Check prerequisites ──────────────────────────────────────────────
check_prereqs() {
  local missing=0

  if ! command -v emcc &> /dev/null; then
    echo -e "${RED}Error: emcc not found.${NC}"
    echo "  Install Emscripten: https://emscripten.org/docs/getting_started/downloads.html"
    echo "  Then: source emsdk_env.sh"
    missing=1
  fi

  if ! command -v cmake &> /dev/null; then
    echo -e "${RED}Error: cmake not found.${NC}"
    missing=1
  fi

  if [[ $missing -eq 1 ]]; then
    exit 1
  fi
}

# ── Module categories ────────────────────────────────────────────────

# Standard CMake: CMakeLists.txt at top level of *-wasm/
# Nested CMake:   CMakeLists.txt in src/<Name>/ (transpiled 68k replayers)
# Shell script:   build.sh at top level
# Rust/wasm-pack: Cargo.toml at top level
# Special:        juce-wasm (multi-target), voclib (single .c, no build system)

# Modules that need their own build scripts (not standard cmake)
SPECIAL_SCRIPTS=(
  "juce-wasm:scripts/build-juce-wasm.sh"
  "uade-wasm:uade-wasm/build.sh"
  "blep-wasm:blep-wasm/build.sh"
)

# Modules that are Rust/wasm-pack (need wasm-pack, not emscripten)
RUST_MODULES=(
  "oidos-wasm"
)

# Modules with no build system yet (single source file, etc.)
SKIP_MODULES=(
  "voclib-wasm"
)

# ── Build functions ──────────────────────────────────────────────────

build_cmake() {
  local dir="$1"
  local name="$2"
  local cmake_dir="$3"  # directory containing CMakeLists.txt

  local build_dir="$cmake_dir/build"

  if [[ $CLEAN -eq 1 ]]; then
    rm -rf "$build_dir"
  fi

  mkdir -p "$build_dir"
  cd "$build_dir"

  emcmake cmake "$cmake_dir" \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_CROSSCOMPILING_EMULATOR="" \
    2>&1 | tail -5

  cmake --build . ${JOBS} 2>&1
}

build_shell() {
  local script="$1"
  cd "$PROJECT_DIR"
  bash "$script"
}

build_rust() {
  local dir="$1"
  local name="$2"

  if ! command -v wasm-pack &> /dev/null; then
    echo -e "${YELLOW}  Skipping $name (wasm-pack not installed)${NC}"
    return 1
  fi

  cd "$dir"
  if [[ $CLEAN -eq 1 ]]; then
    rm -rf pkg target
  fi
  wasm-pack build --target web --release
}

# ── Discover modules ─────────────────────────────────────────────────

declare -a MODULES=()  # array of "name:type:path"

discover_modules() {
  # Standard CMake modules (CMakeLists.txt at top level)
  for dir in "$PROJECT_DIR"/*-wasm/; do
    [[ -d "$dir" ]] || continue
    local name
    name=$(basename "$dir")

    # Skip special/rust/skip modules
    local skip=0
    for s in "${SPECIAL_SCRIPTS[@]}"; do
      [[ "$name" == "${s%%:*}" ]] && skip=1
    done
    for s in "${RUST_MODULES[@]}"; do
      [[ "$name" == "$s" ]] && skip=1
    done
    for s in "${SKIP_MODULES[@]}"; do
      [[ "$name" == "$s" ]] && skip=1
    done
    [[ $skip -eq 1 ]] && continue

    # Check for top-level CMakeLists.txt
    if [[ -f "$dir/CMakeLists.txt" ]]; then
      MODULES+=("$name:cmake:$dir")
      continue
    fi

    # Check for nested CMakeLists.txt (transpiled 68k pattern: src/<Name>/CMakeLists.txt)
    local nested
    nested=$(find "$dir/src" -maxdepth 2 -name "CMakeLists.txt" 2>/dev/null | head -1)
    if [[ -n "$nested" ]]; then
      MODULES+=("$name:cmake-nested:$(dirname "$nested")")
      continue
    fi

    echo -e "${YELLOW}  Warning: No build system found for $name${NC}"
  done

  # Special script modules
  for entry in "${SPECIAL_SCRIPTS[@]}"; do
    local name="${entry%%:*}"
    local script="${entry#*:}"
    MODULES+=("$name:script:$PROJECT_DIR/$script")
  done

  # Rust modules
  for name in "${RUST_MODULES[@]}"; do
    MODULES+=("$name:rust:$PROJECT_DIR/$name")
  done
}

# ── Main ─────────────────────────────────────────────────────────────

if [[ $LIST_ONLY -eq 0 ]]; then
  check_prereqs
fi

discover_modules

# Sort modules by name
IFS=$'\n' MODULES=($(sort <<<"${MODULES[*]}")); unset IFS

# Apply filter
if [[ -n "$FILTER" ]]; then
  FILTERED=()
  for m in "${MODULES[@]}"; do
    name="${m%%:*}"
    if [[ "$name" == *"$FILTER"* ]]; then
      FILTERED+=("$m")
    fi
  done
  MODULES=("${FILTERED[@]}")
fi

# List mode
if [[ $LIST_ONLY -eq 1 ]]; then
  echo "Buildable WASM modules (${#MODULES[@]} total):"
  echo ""
  for m in "${MODULES[@]}"; do
    name="${m%%:*}"
    rest="${m#*:}"
    type="${rest%%:*}"
    printf "  %-35s [%s]\n" "$name" "$type"
  done
  exit 0
fi

echo -e "${CYAN}========================================"
echo "  DEViLBOX — Build All WASM Modules"
echo "  ${#MODULES[@]} modules to build"
echo -e "========================================${NC}"
echo ""

if [[ $DRY_RUN -eq 1 ]]; then
  echo "Dry run — would build:"
  for m in "${MODULES[@]}"; do
    name="${m%%:*}"
    rest="${m#*:}"
    type="${rest%%:*}"
    echo "  $name ($type)"
  done
  exit 0
fi

# Build each module
PASSED=0
FAILED=0
FAILED_LIST=()
SKIPPED=0

for m in "${MODULES[@]}"; do
  name="${m%%:*}"
  rest="${m#*:}"
  type="${rest%%:*}"
  path="${rest#*:}"

  echo -e "${CYAN}── Building: $name ($type)${NC}"

  set +e
  case "$type" in
    cmake)
      build_cmake "$path" "$name" "$path" 2>&1 | tail -20
      ;;
    cmake-nested)
      build_cmake "$path" "$name" "$path" 2>&1 | tail -20
      ;;
    script)
      build_shell "$path" 2>&1 | tail -20
      ;;
    rust)
      build_rust "$path" "$name" 2>&1 | tail -20
      ;;
  esac
  result=$?
  set -e

  if [[ $result -eq 0 ]]; then
    echo -e "${GREEN}  OK${NC}"
    ((PASSED++))
  else
    echo -e "${RED}  FAILED${NC}"
    ((FAILED++))
    FAILED_LIST+=("$name")
  fi
  echo ""
done

# Summary
echo -e "${CYAN}========================================"
echo "  Build Summary"
echo -e "========================================${NC}"
echo -e "  ${GREEN}Passed: $PASSED${NC}"
echo -e "  ${RED}Failed: $FAILED${NC}"
if [[ $SKIPPED -gt 0 ]]; then
  echo -e "  ${YELLOW}Skipped: $SKIPPED${NC}"
fi

if [[ $FAILED -gt 0 ]]; then
  echo ""
  echo -e "${RED}Failed modules:${NC}"
  for f in "${FAILED_LIST[@]}"; do
    echo "  - $f"
  done
  exit 1
fi

echo ""
echo -e "${GREEN}All modules built successfully!${NC}"
