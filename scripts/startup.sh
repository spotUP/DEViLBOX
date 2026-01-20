#!/bin/bash

# DEViLBOX Startup & Build Script
# This script ensures a fresh environment and provides build options for Web and Electron.

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

# 3. Prompt for build target
echo ""
echo "Select build target:"
echo "1) Web (Production Preview)"
echo "2) Electron (Local Native App)"
echo "3) Both (Web + Electron)"
echo "4) Development (Vite Dev Server)"
read -p "Enter choice [1-4]: " choice

case $choice in
    1)
        echo "Building for Web..."
        npm run build
        if [ $? -eq 0 ]; then
            echo "--- Web Build Successful ---"
            echo "Starting production preview server..."
            npm run preview -- --open
        fi
        ;;
    2)
        echo "Building for Electron..."
        npm run electron:build
        if [ $? -eq 0 ]; then
            echo "--- Electron Build Successful ---"
            echo "Native app available in 'dist_electron' directory."
        fi
        ;;
    3)
        echo "Building both Web and Electron..."
        npm run build && npm run electron:build
        if [ $? -eq 0 ]; then
            echo "--- Full Build Successful ---"
            echo "Web preview ready, native app in 'dist_electron'."
            npm run preview -- --open
        fi
        ;;
    4)
        echo "Starting Development Mode..."
        npm run dev
        ;;
    *)
        echo "Invalid choice. Exiting."
        exit 1
        ;;
esac