#!/bin/bash

# Buzzmachines Testing Script
# Verifies all components are ready and provides testing instructions

echo "🧪 Buzzmachines Testing Verification"
echo "===================================="
echo ""

# Check WASM files
echo "1️⃣  Checking WASM files..."
if [ -f "public/buzzmachines/Arguru_Distortion.wasm" ] && [ -f "public/buzzmachines/Elak_SVF.wasm" ]; then
    echo "   ✅ WASM files present"
    ls -lh public/buzzmachines/*.wasm | awk '{print "      " $9 " (" $5 ")"}'
else
    echo "   ❌ WASM files missing! Run: ./scripts/build-buzzmachines.sh"
    exit 1
fi
echo ""

# Check source files
echo "2️⃣  Checking source files..."
REQUIRED_FILES=(
    "src/engine/buzzmachines/BuzzmachineEngine.ts"
    "src/engine/buzzmachines/BuzzmachineSynth.ts"
    "src/components/instruments/BuzzmachineEditor.tsx"
    "public/Buzzmachine.worklet.js"
)

ALL_PRESENT=true
for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "   ✅ $file"
    else
        echo "   ❌ $file (missing!)"
        ALL_PRESENT=false
    fi
done
echo ""

if [ "$ALL_PRESENT" = false ]; then
    echo "❌ Some required files are missing!"
    exit 1
fi

# TypeScript check
echo "3️⃣  Running TypeScript check..."
if npm run type-check > /dev/null 2>&1; then
    echo "   ✅ TypeScript: All checks pass"
else
    echo "   ❌ TypeScript: Errors found"
    echo "   Run: npm run type-check"
    exit 1
fi
echo ""

# Summary
echo "✅ All verifications passed!"
echo ""
echo "🚀 Ready to Test!"
echo "=================="
echo ""
echo "Option 1: Quick Test (Browser Console)"
echo "  open test-buzzmachine.html"
echo ""
echo "Option 2: Full UI Test (Dev Server)"
echo "  npm run dev"
echo "  Then open: http://localhost:5173"
echo ""
echo "Option 3: Production Build Test"
echo "  npm run build && npm run preview"
echo ""
echo "📚 Testing Guide: See TESTING_GUIDE.md"
echo ""
