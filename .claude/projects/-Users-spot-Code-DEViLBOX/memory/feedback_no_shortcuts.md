---
name: feedback_no_shortcuts
description: Don't use shortcuts or skip steps when implementing format parsers — do the full research and implementation properly
type: feedback
---

Don't take shortcuts when implementing format parsers. Do the full research, read the source code, understand the binary layout, and implement properly. Don't skip to "just extract samples" or "batch update" — each format deserves proper analysis and implementation.

**Why:** The user wants quality implementations, not quick hacks. Cutting corners leads to broken parsers that need to be redone.

**How to apply:** For each format: read the UADE player source thoroughly, hex dump multiple files, understand the full binary structure, then implement a proper parser with sample extraction, pattern data where feasible, and correct metadata.
