#!/bin/bash
#
# DEViLBOX Deploy Script
# Commits all changes, pushes to GitHub, and deploys to GitHub Pages
#

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}                    DEViLBOX Deploy Script                  ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Check if we're in a git repo
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    echo -e "${RED}Error: Not in a git repository${NC}"
    exit 1
fi

# Check for uncommitted changes
if [[ -n $(git status --porcelain) ]]; then
    echo -e "${YELLOW}📝 Uncommitted changes detected${NC}"
    echo ""

    # Show what will be committed
    echo -e "${BLUE}Changes to be committed:${NC}"
    git status --short
    echo ""

    # Get commit message
    if [[ -n "$1" ]]; then
        COMMIT_MSG="$1"
    else
        echo -e "${YELLOW}Enter commit message (or press Enter for default):${NC}"
        read -r COMMIT_MSG
        if [[ -z "$COMMIT_MSG" ]]; then
            COMMIT_MSG="Update $(date '+%Y-%m-%d %H:%M')"
        fi
    fi

    # Stage all changes
    echo -e "${BLUE}Staging all changes...${NC}"
    git add -A

    # Commit
    echo -e "${BLUE}Committing...${NC}"
    git commit -m "$COMMIT_MSG"
    echo -e "${GREEN}✓ Changes committed${NC}"
else
    echo -e "${GREEN}✓ Working tree clean - no changes to commit${NC}"
fi

echo ""

# Push to GitHub
echo -e "${BLUE}Pushing to GitHub...${NC}"
if git push; then
    echo -e "${GREEN}✓ Pushed to GitHub${NC}"
else
    echo -e "${RED}Failed to push to GitHub${NC}"
    exit 1
fi

echo ""

# Build and deploy to GitHub Pages
echo -e "${BLUE}Building and deploying to GitHub Pages...${NC}"
echo -e "${YELLOW}This may take a minute...${NC}"
echo ""

if npm run deploy; then
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}✓ Successfully deployed to GitHub Pages!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "🌐 Your site is live at: ${BLUE}https://spotup.github.io/DEViLBOX/${NC}"
    echo ""
else
    echo -e "${RED}Failed to deploy to GitHub Pages${NC}"
    exit 1
fi
