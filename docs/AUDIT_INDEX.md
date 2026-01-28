# Codebase Audit - Documentation Index

**Audit Date:** January 13, 2026  
**Project:** Scribbleton Live - React Music Tracker  
**Auditor:** Claude Sonnet 4.5

---

## Overview

This audit identified **200+ instances** of hardcoded problems across **15+ files** in the scribbleton-react codebase. The findings are organized into 8 major categories, with detailed documentation, examples, and an actionable implementation plan.

---

## Documentation Files

### 1. AUDIT_REPORT.md (11 KB)
**Comprehensive Analysis**

The main audit document with detailed findings, impact analysis, and recommendations.

**Contents:**
- Complete analysis of all 8 problem categories
- Detailed examples for each issue type
- Proposed solutions with code snippets
- Priority breakdown (High/Medium/Low)
- Metrics and statistics
- Next steps and recommendations

**Best for:** Technical deep-dive, understanding the full scope of issues

---

### 2. AUDIT_EXAMPLES.md (11 KB)
**Before/After Code Examples**

Practical code examples showing current problems and proposed solutions.

**Contains 8 detailed examples:**
1. Hardcoded Sequential IDs
2. Duplicate TB-303 Presets
3. Magic Numbers in Audio Engine
4. Duplicate Instrument ID Generation
5. Timestamp-Based ID Generation
6. BPM Constants Not Imported Correctly
7. Duplicate Default Values in Presets
8. Pattern Defaults

**Best for:** Understanding what to change and how to fix it

---

### 3. AUDIT_SUMMARY.txt (10 KB)
**Executive Summary**

High-level overview formatted for easy reading and sharing.

**Sections:**
- Executive summary of findings
- Priority breakdown
- Files requiring changes
- Implementation roadmap (5 phases)
- Effort estimation (40 hours)
- Benefits analysis

**Best for:** Project managers, quick overview, planning

---

### 4. AUDIT_CHECKLIST.md (Current File)
**Quick Reference & Action Items**

Line-by-line checklist with specific file locations and changes needed.

**Features:**
- Checkbox format for tracking progress
- Exact line numbers for each change
- Code templates for new files
- Verification commands
- Testing checklist

**Best for:** Implementation, tracking progress, developers making changes

---

## Quick Statistics

| Metric | Count |
|--------|-------|
| Total Issues Found | 200+ |
| Files Affected | 15+ |
| Hardcoded Preset IDs | 36 |
| Duplicate TB-303 Presets | 8 |
| Magic Numbers | 30+ |
| ID Generation Patterns | 6 |
| Duplicate Defaults | 88 |
| Console Messages | 58 |
| Estimated Effort | 40 hours |

---

## Problem Categories

### High Priority (6 issues)
1. **Hardcoded Preset IDs** - 36 manual IDs in factoryPresets.ts
2. **Duplicate TB-303 Presets** - 8 presets duplicated across files
3. **Magic Numbers** - 30+ instances in audio engine
4. **Duplicate ID Generation** - 2 identical code blocks
5. **BPM Import Issue** - Constants imported as types
6. **Timestamp IDs** - 6 inconsistent patterns

### Medium Priority (3 issues)
7. **Duplicate Defaults** - 88 repeated default values
8. **Console Messages** - 58 hardcoded strings
9. **Pattern Defaults** - 2 hardcoded values

---

## Files Requiring Changes

### Existing Files to Modify

**High Impact:**
- `src/constants/factoryPresets.ts` - 36 IDs, 88 duplicates
- `src/constants/tb303Presets.ts` - Source of truth for TB-303
- `src/engine/EffectCommands.ts` - 10+ magic numbers
- `src/engine/AutomationPlayer.ts` - 10+ magic numbers
- `src/stores/useInstrumentStore.ts` - Duplicate code
- `src/stores/useTransportStore.ts` - Import fix

**Medium Impact:**
- `src/stores/useProjectStore.ts`
- `src/stores/useTrackerStore.ts`
- `src/stores/useAutomationStore.ts`
- `src/stores/useHistoryStore.ts`
- `src/engine/ToneEngine.ts`

### New Files to Create

- `src/constants/audioConstants.ts` - All magic numbers
- `src/utils/idGenerator.ts` - Centralized ID generation
- `src/constants/trackerConstants.ts` - Pattern defaults (optional)

---

## Implementation Roadmap

### Phase 1: Foundation (4 hours)
- Create audioConstants.ts
- Create idGenerator.ts
- Fix type imports in audio.ts

### Phase 2: Audio Engine (8 hours)
- Refactor EffectCommands.ts
- Refactor AutomationPlayer.ts
- Refactor ToneEngine.ts

### Phase 3: Stores (12 hours)
- Refactor useInstrumentStore.ts
- Refactor useTransportStore.ts
- Update all stores with idGenerator

### Phase 4: Presets (8 hours)
- Refactor factoryPresets.ts
- Consolidate TB-303 presets
- Extract preset defaults

### Phase 5: Testing (8 hours)
- Test all changes
- Update documentation
- Create migration guide

**Total: 40 hours (5 days @ 8 hours/day)**

---

## How to Use This Audit

### For Project Managers
1. Start with **AUDIT_SUMMARY.txt** for overview
2. Review roadmap and effort estimates
3. Prioritize phases based on team capacity

### For Developers
1. Read **AUDIT_EXAMPLES.md** to understand changes
2. Use **AUDIT_CHECKLIST.md** for implementation
3. Refer to **AUDIT_REPORT.md** for detailed context
4. Track progress with checklist items

### For Code Review
1. Reference specific sections in AUDIT_REPORT.md
2. Use examples from AUDIT_EXAMPLES.md
3. Verify against checklist items

---

## Key Takeaways

### Problems
- 36 hardcoded preset IDs are error-prone and hard to maintain
- 8 TB-303 presets are duplicated with slight differences
- 30+ magic numbers scattered across audio engine
- 6 different ID generation patterns cause inconsistency
- 88 duplicate default values create maintenance burden

### Solutions
- Auto-generate preset IDs using array indices
- Single source of truth for TB-303 presets
- Centralize all magic numbers in audioConstants.ts
- Unified ID generation utility
- Extract shared defaults to constants

### Benefits
- Eliminate 200+ hardcoded values
- Reduce code duplication by ~100 lines
- Improve maintainability and scalability
- Easier to add/modify presets and constants
- Reduced risk of bugs from manual edits

---

## Verification

Use these commands to verify issues:

```bash
# Count hardcoded preset IDs
grep -n "id:" src/constants/factoryPresets.ts | wc -l
# Expected: 36

# Find instrument ID limit
grep -rn "256\|0xFF" src --include="*.ts" | grep -v node_modules
# Expected: 4-6 instances

# Find timestamp IDs
grep -rn "Date.now()" src --include="*.ts"
# Expected: 6+ instances

# Count duplicate defaults
grep -rn "volume: -12,\|pan: 0," src/constants --include="*.ts" | wc -l
# Expected: 88

# Find magic numbers
grep -rn "0x40\|-40\|255\|200\|1200" src/engine --include="*.ts"
# Expected: 30+ instances
```

---

## Questions & Support

For questions about specific findings:
- **Technical Details:** See AUDIT_REPORT.md
- **Code Changes:** See AUDIT_EXAMPLES.md
- **Implementation:** See AUDIT_CHECKLIST.md
- **Planning:** See AUDIT_SUMMARY.txt

---

## Document History

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-13 | 1.0 | Initial audit completed |

---

**Generated by:** Claude Sonnet 4.5  
**Repository:** `/Users/spot/Code/scribbleton-live-master/scribbleton-react`
