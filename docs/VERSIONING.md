# DEViLBOX Versioning System

## Overview

DEViLBOX uses an **automatic versioning system** that increments the build number with every git commit. This provides clear traceability of which code version is running.

## Version Format

The app displays versions in the format: `MAJOR.MINOR.PATCH+BUILD`

Example: `1.0.0+42`

- **1.0.0** = Semantic version from `package.json` (manually managed)
- **42** = Build number (auto-increments with each git commit)

## How It Works

### 1. Changelog Generation Script
The `scripts/generate-changelog.cjs` script runs automatically before every build and dev server start:

- **prebuild**: Runs before production builds
- **predev**: Runs before starting dev server

### 2. Auto-Generated Constants
The script generates `/src/generated/changelog.ts` with these exports:

```typescript
export const BUILD_VERSION = '1.0.0';  // From package.json
export const BUILD_NUMBER = '42';       // Git commit count
export const BUILD_HASH = '4aa8421';    // Short git hash
export const BUILD_DATE = '2026-01-21'; // Build date
export const FULL_VERSION = '1.0.0+42'; // Combined version
```

### 3. Version Display
The version is displayed in the navbar (top-left corner) with a tooltip showing detailed build info:

- **Main text**: `v1.0.0+42`
- **Tooltip**: `Build #42 • 4aa8421 • 2026-01-21`

## Usage

### Check Current Version
```bash
npm run version:info
```

Output:
```
Version: 1.0.0
Build: 42
Hash: 4aa8421
```

### Update Semantic Version
To update the major/minor/patch version, edit `package.json`:

```json
{
  "version": "1.1.0"  // Update this manually
}
```

The build number will continue to auto-increment with each commit.

### Force Changelog Regeneration
```bash
npm run changelog
```

## Implementation Details

### Build Number Calculation
The build number is the total git commit count:

```bash
git rev-list --count HEAD
```

This means:
- ✅ **Monotonically increasing** - never goes backwards
- ✅ **Deterministic** - same commit = same build number
- ✅ **Zero configuration** - works automatically
- ✅ **Branch-aware** - different branches may have different counts

### Git Hash
The short git hash (7 characters) identifies the exact commit:

```bash
git rev-parse --short HEAD
```

This allows:
- ✅ **Exact commit tracking** - can checkout any build's exact code
- ✅ **Bug reporting** - users can report issues with specific builds
- ✅ **Debugging** - developers can reproduce exact build states

## Files Modified

1. **`/src/constants/version.ts`** - Now imports from auto-generated changelog
2. **`/src/components/layout/NavBar.tsx`** - Displays version with detailed tooltip
3. **`/src/generated/changelog.ts`** - Auto-generated (never edit manually)
4. **`package.json`** - Added `version:info` script

## Benefits

1. **No manual tracking** - Build numbers update automatically
2. **Clear traceability** - Every build maps to a specific git commit
3. **User-friendly** - Version visible in UI with detailed info on hover
4. **Developer-friendly** - Easy to identify which code is running
5. **CI/CD ready** - Works automatically in any git-based workflow

## Example Workflow

```bash
# Make changes
git add .
git commit -m "feat: Add new feature"  # Build number increments: 42 → 43

# Start dev server (changelog auto-generates)
npm run dev  # Shows v1.0.0+43

# Create production build
npm run build  # Builds with v1.0.0+43

# Check version info
npm run version:info
# Version: 1.0.0
# Build: 43
# Hash: a1b2c3d
```

## Notes

- The build number resets if you clone the repo fresh (starts from current commit count)
- Squashed commits will have different build numbers than the original commits
- Rebasing may change build numbers for rebased commits
- The semantic version (MAJOR.MINOR.PATCH) should follow [Semantic Versioning](https://semver.org/) principles
