# DEViLBOX Project Memory

## Furnace Synth Implementation

*** IMPORTANT ***

When debugging or implementing Furnace chip synths (GB, NES, OPN2, OPM, etc.):

1. **NEVER guess** - Always reference the actual Furnace source code
2. **Get proof/evidence** - Read the relevant platform file (e.g., `gb.cpp`, `nes.cpp`)
3. **Implement 1:1** - Match the Furnace source exactly, including:
   - Register write sequences
   - Timing/order of writes
   - Envelope formats
   - Frequency calculations
   - Key-on/key-off sequences

Reference code location: `/Users/spot/Code/DEViLBOX/Reference Code/furnace-master/src/engine/platform/`

*** IMPORTANT ***
