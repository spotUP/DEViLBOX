#!/bin/bash

# DEViLBOX Startup & Build Script
# This script ensures a fresh environment and provides build options for Web and Electron.
#
# Usage:
#   ./scripts/startup.sh [target]
#
# Targets:
#   web       - Web (Production Preview) - DEFAULT for CI/CD
#   electron  - Electron (Local Native App)
#   both      - Both (Web + Electron)
#   dev       - Development (Vite Dev Server)
#
# If no target is specified, defaults to 'web' (GitHub Pages build)

echo "--- DEViLBOX Build System ---"

# 1. Clear stale build artifacts
if [ -d "dist" ]; then
    echo "Cleaning 'dist' directory..."
    rm -rf dist
fi

if [ -d "dist_electron" ]; then
    echo "Cleaning 'dist_electron' directory..."
    rm -rf dist_electron
fi

# 2. Clear Vite cache
if [ -d "node_modules/.vite" ]; then
    echo "Cleaning Vite cache..."
    rm -rf node_modules/.vite
fi

# 3. Determine build target (default: web for GitHub Pages)
TARGET="${1:-web}"

echo ""
echo "Build target: $TARGET"
echo ""

case $TARGET in
    web|1)
        echo "Building for Web (GitHub Pages)..."
        npm run build
        if [ $? -eq 0 ]; then
            echo "--- Web Build Successful ---"
            echo "Build artifacts ready in 'dist/' directory"
            echo "To preview locally: npm run preview"
        fi
        ;;
    electron|2)
        echo "Building for Electron..."
        npm run electron:build
        if [ $? -eq 0 ]; then
            echo "--- Electron Build Successful ---"
            echo "Native app available in 'dist_electron' directory."
        fi
        ;;
    both|3)
        echo "Building both Web and Electron..."
        npm run build && npm run electron:build
        if [ $? -eq 0 ]; then
            echo "--- Full Build Successful ---"
            echo "Web preview ready, native app in 'dist_electron'."
            npm run preview -- --open
        fi
        ;;
    dev|4)
        echo "Starting Development Mode..."
        npm run dev
        ;;
    *)
        echo "Invalid target: $TARGET"
        echo ""
        echo "Usage: $0 [target]"
        echo "Targets: web (default), electron, both, dev"
        exit 1
        ;;
esac