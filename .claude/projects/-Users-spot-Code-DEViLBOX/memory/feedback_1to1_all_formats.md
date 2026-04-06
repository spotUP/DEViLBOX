---
name: feedback_1to1_all_formats
description: ALL format parsers must be implemented 1:1 with full editing — no stubs, no shortcuts, no "not worth it" dismissals
type: feedback
---

Every single format parser must be implemented as a complete, 1:1 faithful implementation. No exceptions.

**Why:** The user explicitly stated they need to trust that ALL formats will be made fully editable. Dismissing formats as "not worth it" or "too small" or "no samples" is unacceptable. Every format gets the same level of effort: full research, full parsing, full editing support, full sample extraction where applicable.

**How to apply:**
- NEVER skip a format because it has few files or small file sizes
- NEVER say "not worth deep implementation" or "move to a bigger target"
- Parse ALL data structures in the binary (SEQU, BLK, INFO chunks, pattern data, sample tables — everything)
- Implement full editing via UADEVariablePatternLayout or UADEPatternLayout
- Extract real samples where the format contains them
- If the format is purely sequencer data (no PCM), still parse and display all pattern/sequence data in the editor
- Treat every format with the same rigor as Dave Lowe: read the UADE source, hex dump files, understand every byte, implement completely
