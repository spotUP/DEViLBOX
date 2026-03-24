---
name: Latency sensitivity
description: Musicians are extremely sensitive to UI/audio latency — all interactions must be tight and lag-free
type: feedback
---

All transport controls, UI interactions, and audio responses must be as tight and lag-free as possible. Musicians notice latency instantly.

**Why:** The user is a musician building a music tracker. Any perceivable delay in play/stop, note input, knob turns, or visual response breaks the creative flow. This was demonstrated during the transport restart fix where ~15ms async delays were unacceptable.

**How to apply:**
- Bypass async React effect cycles for time-critical paths (use direct engine calls)
- Eliminate dual-handler conflicts where React + global handlers both process the same key
- Skip redundant init checks when audio infrastructure is already running
- Never throttle below perceptual thresholds (keep 60fps, don't suggest 30fps)
- Profile before suggesting "improvements" — only fix measured latency, not theoretical
