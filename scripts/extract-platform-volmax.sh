#!/bin/bash
# Extract GET_VOLMAX values from Furnace platform implementations
# Output format: <platform_file>: <max_vol>

cd "/Users/spot/Code/DEViLBOX/Reference Code/furnace-master/src/engine/platform"

for file in *.cpp; do
  maxvol=$(grep -A2 "case DIV_CMD_GET_VOLMAX:" "$file" | grep "return" | head -1 | sed -E 's/.*return ([0-9]+);.*/\1/')
  if [ -n "$maxvol" ]; then
    echo "$file: $maxvol"
  fi
done
