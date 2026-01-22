#!/bin/bash

# DEViLBOX Release Script
# Automates version bumping, tagging, and triggering Electron builds
#
# Usage:
#   ./scripts/release.sh [patch|minor|major]
#
# Examples:
#   ./scripts/release.sh patch   # 1.0.0 -> 1.0.1
#   ./scripts/release.sh minor   # 1.0.0 -> 1.1.0
#   ./scripts/release.sh major   # 1.0.0 -> 2.0.0

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get bump type (default to patch)
BUMP_TYPE="${1:-patch}"

# Validate bump type
if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
    echo -e "${RED}Error: Invalid bump type '$BUMP_TYPE'${NC}"
    echo "Usage: $0 [patch|minor|major]"
    exit 1
fi

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  DEViLBOX Release Automation${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if working directory is clean
if [[ -n $(git status -s) ]]; then
    echo -e "${RED}Error: Working directory is not clean${NC}"
    echo "Please commit or stash your changes first:"
    git status -s
    exit 1
fi

# Check if on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" != "main" ]]; then
    echo -e "${YELLOW}Warning: You are on branch '$CURRENT_BRANCH', not 'main'${NC}"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Get current version from package.json
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "Current version: ${GREEN}v$CURRENT_VERSION${NC}"

# Calculate new version
IFS='.' read -r -a VERSION_PARTS <<< "$CURRENT_VERSION"
MAJOR="${VERSION_PARTS[0]}"
MINOR="${VERSION_PARTS[1]}"
PATCH="${VERSION_PARTS[2]}"

case $BUMP_TYPE in
    major)
        MAJOR=$((MAJOR + 1))
        MINOR=0
        PATCH=0
        ;;
    minor)
        MINOR=$((MINOR + 1))
        PATCH=0
        ;;
    patch)
        PATCH=$((PATCH + 1))
        ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
echo -e "New version:     ${GREEN}v$NEW_VERSION${NC} (${BUMP_TYPE} bump)"
echo ""

# Confirm with user
read -p "Create release v$NEW_VERSION? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Release cancelled${NC}"
    exit 0
fi

echo ""
echo -e "${BLUE}Step 1/5:${NC} Updating package.json..."

# Update version in package.json
node -e "
const fs = require('fs');
const pkg = require('./package.json');
pkg.version = '$NEW_VERSION';
fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
"

echo -e "${GREEN}✓${NC} Version updated to $NEW_VERSION"

echo ""
echo -e "${BLUE}Step 2/5:${NC} Committing changes..."

# Commit the version change
git add package.json
git commit -m "chore: Release v$NEW_VERSION

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

echo -e "${GREEN}✓${NC} Committed version bump"

echo ""
echo -e "${BLUE}Step 3/5:${NC} Creating git tag..."

# Create annotated tag
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

echo -e "${GREEN}✓${NC} Created tag v$NEW_VERSION"

echo ""
echo -e "${BLUE}Step 4/5:${NC} Pushing to GitHub..."

# Push commit and tag
git push origin "$CURRENT_BRANCH"
git push origin "v$NEW_VERSION"

echo -e "${GREEN}✓${NC} Pushed to GitHub"

echo ""
echo -e "${BLUE}Step 5/5:${NC} Triggering release workflow..."
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Release v$NEW_VERSION created successfully!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "Build progress:"
echo -e "  ${BLUE}→${NC} https://github.com/spotUP/DEViLBOX/actions"
echo ""
echo -e "Estimated build time: ${YELLOW}10-15 minutes${NC}"
echo ""
echo -e "Release will be available at:"
echo -e "  ${BLUE}→${NC} https://github.com/spotUP/DEViLBOX/releases/tag/v$NEW_VERSION"
echo ""
echo -e "Binaries included:"
echo -e "  ${GREEN}✓${NC} macOS (dmg, zip)"
echo -e "  ${GREEN}✓${NC} Windows (exe, zip)"
echo -e "  ${GREEN}✓${NC} Linux (AppImage, deb, tar.gz)"
echo ""
echo -e "${YELLOW}Tip:${NC} Add release notes at:"
echo -e "  https://github.com/spotUP/DEViLBOX/releases/edit/v$NEW_VERSION"
echo ""
