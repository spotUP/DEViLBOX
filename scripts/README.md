# Scripts

Utility scripts for DEViLBOX development and deployment.

## Release Management

### `release.sh` - Automated Release Creation

Creates a new release with automatic version bumping and GitHub deployment.

**Usage:**
```bash
./scripts/release.sh [patch|minor|major]
```

**Examples:**
```bash
# Patch release: 1.0.0 -> 1.0.1 (bug fixes)
./scripts/release.sh patch

# Minor release: 1.0.0 -> 1.1.0 (new features)
./scripts/release.sh minor

# Major release: 1.0.0 -> 2.0.0 (breaking changes)
./scripts/release.sh major
```

**What it does:**
1. Validates working directory is clean
2. Confirms you're on the main branch (with override option)
3. Bumps version in package.json
4. Commits the version change
5. Creates an annotated git tag
6. Pushes commit and tag to GitHub
7. Triggers GitHub Actions to build Electron apps for all platforms

**Requirements:**
- Clean git working directory
- Node.js installed
- Git configured with push access to the repository

**Output:**
- Builds Windows (.exe, .zip)
- Builds macOS (.dmg, .zip)
- Builds Linux (.AppImage, .deb, .tar.gz)
- Publishes to GitHub Releases (~10-15 minutes)

See [RELEASE_PROCESS.md](../docs/RELEASE_PROCESS.md) for detailed documentation.

## Build Scripts

### `startup.sh` - Development & Production Builds

Main build script with support for web and Electron builds.

**Usage:**
```bash
./scripts/startup.sh [target]
```

**Targets:**
- `web` (default) - Production web build for GitHub Pages
- `electron` - Electron desktop app build
- `both` - Build both web and Electron
- `dev` - Start development server

**Examples:**
```bash
# Production web build (CI/CD default)
./scripts/startup.sh web

# Build Electron desktop app
./scripts/startup.sh electron

# Start development server
./scripts/startup.sh dev
```

## Changelog Generation

### `generate-changelog.cjs` - Automatic Changelog

Automatically run before builds to generate changelog from git commits.

**Usage:**
```bash
node scripts/generate-changelog.cjs
```

**Output:**
- Updates `src/generated/changelog.ts`
- Parses conventional commit messages
- Extracts version info from git

**Commit Message Format:**
```
feat: Add new feature      -> Feature
fix: Fix a bug            -> Fix
perf: Improve performance -> Improvement
```

## Development Workflow

### Quick Start
```bash
# Install dependencies
npm install

# Start development server
./scripts/startup.sh dev

# Build for production
./scripts/startup.sh web
```

### Creating a Release
```bash
# 1. Make your changes and commit
git add .
git commit -m "feat: Add awesome feature"

# 2. Create release (patch/minor/major)
./scripts/release.sh patch

# 3. Wait for builds to complete
# Check: https://github.com/spotUP/DEViLBOX/actions

# 4. Add release notes
# Visit: https://github.com/spotUP/DEViLBOX/releases
```
