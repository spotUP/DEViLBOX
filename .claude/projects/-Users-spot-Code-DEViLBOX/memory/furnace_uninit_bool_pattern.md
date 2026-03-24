---
name: furnace-uninitialized-bool-pattern
description: Furnace platform classes have uninitialized bool members that cause WASM crashes, silence, or wrong code paths — systematic fix pattern
type: feedback
---

Furnace chip platform classes (DivPlatform*) frequently have uninitialized bool members that cause silent failures in WASM.

**Why:** WASM heap memory from `new` reuses freed blocks with non-zero data. Bools like `useNP`, `useYMFM`, `is219`, `useAltASAP` get garbage values. When checked in `init()` before `setFlags()` sets them, they take wrong code paths (wrong emulator, crash, or acquireDirect returning early).

**How to apply:** When adding or debugging a Furnace chip platform:
1. Check the `.h` file for `bool` members (especially `use*`, `is*`, `ext*`)
2. Check if the `.cpp` has a constructor with initializer list
3. If not, add one initializing all bools to false/0
4. Key danger: bools checked in `init()` BEFORE `setFlags()` is called

**Fixed so far:** NES, Arcade, FDS, Genesis, POKEY, C140. Many more platforms have uninit bools but aren't critical (set in `reset()` before first use).
