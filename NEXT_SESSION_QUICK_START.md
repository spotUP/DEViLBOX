# Next Session Quick Start

## 🚀 Where We Left Off

We've completed the **foundation** for the neural pedalboard system:
- ✅ Complete type system (`pedalboard.ts`)
- ✅ All 37 models cataloged (`guitarMLRegistry.ts`)
- ✅ Effect chain engine (`PedalboardEngine.ts`)
- ✅ TypeScript strict mode enforced
- ✅ Comprehensive migration guide

**34 files** need updating to use the new system. All documented in `PEDALBOARD_MIGRATION_GUIDE.md`.

---

## 🎯 Recommended Start

### Option A: One Working Demo (Fastest to test)

**Goal:** Get ONE component working to test the pedalboard

1. Update `TB303EngineAccurate.ts` (~30 min)
   - Replace `GuitarMLEngine` with `PedalboardEngine`
   - Update signal routing
   - See migration guide Pattern: Engine Integration

2. Create simple test preset (~5 min)
   ```typescript
   pedalboard: {
     enabled: true,
     inputGain: 100,
     outputGain: 100,
     chain: [
       {
         id: 'test-ts808',
         enabled: true,
         type: 'neural',
         modelIndex: 0, // TS808
         modelName: 'TS808',
         parameters: { drive: 60, tone: 50, level: 75, dryWet: 100 }
       }
     ]
   }
   ```

3. Load in TB303KnobPanel temporarily (~10 min)
   - Quick hack to test audio
   - Don't worry about UI yet

4. **TEST IT** - Verify effect chain works! 🎸

### Option B: Systematic Migration (Most organized)

**Goal:** Migrate everything in dependency order

1. **Engine Layer** (1-2 hours)
   - `TB303EngineAccurate.ts`
   - `TB303AccurateSynth.ts`
   - `TB303Engine.ts` (if needed)

2. **Presets** (1-2 hours)
   - `factoryPresets.ts` - Use conversion helper
   - `tb303Presets.ts` - Batch convert
   - Create new pedalboard presets

3. **Main UI** (2-3 hours)
   - `TB303KnobPanel.tsx` - Biggest component
   - Add basic pedalboard UI
   - Test with presets

4. **Other Components** (1-2 hours)
   - Editors and demos
   - Simpler updates

### Option C: New UI First (Most visual)

**Goal:** Build the pedalboard UI to see what we're working towards

1. **Create `PedalboardManager.tsx`** (2 hours)
   - Main container
   - Effect list
   - Add/remove buttons

2. **Create `EffectPedal.tsx`** (1 hour)
   - Individual effect display
   - Parameter knobs
   - Bypass switch

3. **Create `ModelBrowser.tsx`** (1 hour)
   - Model selection
   - Search/filter
   - Categories

4. **Integrate into TB303KnobPanel** (1 hour)
   - Replace overdrive section
   - Wire up state

---

## 📋 Quick Reference

### Key Files

**Type Definitions:**
```
src/types/pedalboard.ts         - All pedalboard types
src/constants/guitarMLRegistry.ts - 37 model catalog
```

**Engine:**
```
src/engine/PedalboardEngine.ts  - Effect chain processor
src/engine/TB303EngineAccurate.ts - Needs update
```

**Migration Guide:**
```
PEDALBOARD_MIGRATION_GUIDE.md   - Complete instructions
SESSION_SUMMARY.md               - What we built
```

### Type-Check Commands

```bash
# Check all errors
npm run type-check

# See just file names
npm run type-check 2>&1 | grep "\.tsx?:" | cut -d: -f1 | sort -u

# Count errors
npm run type-check 2>&1 | grep "error TS" | wc -l
```

### Common Code Patterns

**Get pedalboard from config:**
```typescript
const pedalboard = currentTb303.pedalboard ?? DEFAULT_PEDALBOARD;
const firstEffect = pedalboard.chain[0];
```

**Update pedalboard:**
```typescript
updateInstrument(inst.id, {
  tb303: {
    ...currentTb303,
    pedalboard: {
      ...pedalboard,
      enabled: true,
      chain: [...pedalboard.chain, newEffect],
    },
  },
});
```

**Create new effect:**
```typescript
import { getModelByIndex } from '@constants/guitarMLRegistry';

const newEffect: PedalboardEffect = {
  id: `effect-${Date.now()}`,
  enabled: true,
  type: 'neural',
  modelIndex: 0,
  modelName: getModelByIndex(0)?.name,
  parameters: {
    drive: 50,
    tone: 50,
    level: 75,
    dryWet: 100,
  },
};
```

---

## 🧪 Testing Strategy

### 1. Audio Test
```typescript
// Create simple 2-effect chain
chain: [
  { modelIndex: 0, enabled: true }, // TS808
  { modelIndex: 9, enabled: true }, // Marshall Plexi
]

// Verify:
// - Both effects process audio
// - Can bypass each effect
// - Chain order matters (swap them)
```

### 2. Parameter Test
```typescript
// Adjust parameters
setEffectParameter('effect-1', 'drive', 80);
setEffectParameter('effect-1', 'tone', 70);

// Verify:
// - Parameters update in real-time
// - No audio clicks
// - Values persist
```

### 3. Add/Remove Test
```typescript
// Add effect
handleAddEffect(2); // Boss MT-2

// Remove effect
handleRemoveEffect('effect-1');

// Verify:
// - Chain updates correctly
// - Audio routing reconfigures
// - No crashes
```

---

## 🎨 UI Mockup

What we're building towards:

```
┌─────────────────────────────────────────────────────┐
│ 🎸 PEDALBOARD                        [✓] ON  [SAVE]│
├─────────────────────────────────────────────────────┤
│ Input Gain: ▮─────                                  │
│                                                      │
│ ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│ │ TS808    │→ │ Plexi    │→ │ EQ       │  [+ Add] │
│ │ [✓] ON   │  │ [✓] ON   │  │ [✓] ON   │           │
│ │          │  │          │  │          │           │
│ │ Drive ▮  │  │ Drive ▮  │  │ Bass  ▮  │           │
│ │ Tone  ▮  │  │ Pres  ▮  │  │ Mid   ▮  │           │
│ │ Level ▮  │  │ Level ▮  │  │ Treb  ▮  │           │
│ │ Mix   ▮  │  │ Mix   ▮  │  │ Mix   ▮  │           │
│ └──────────┘  └──────────┘  └──────────┘           │
│                                                      │
│ Output Gain: ▮─────                                 │
│                                                      │
│ [Browse Models] [Load Preset] [Save Preset]        │
└─────────────────────────────────────────────────────┘
```

---

## 🐛 Common Issues & Solutions

### Issue: Type errors in migration

**Solution:** Follow the exact patterns in migration guide
```typescript
// ❌ Wrong
overdrive?.modelIndex

// ✅ Right
pedalboard?.chain[0]?.modelIndex
```

### Issue: Audio not routing through effects

**Solution:** Check PedalboardEngine initialization
```typescript
await pedalboard.initialize();
workletNode.connect(pedalboard.getInput());
pedalboard.connect(outputGain);
```

### Issue: Parameters not updating

**Solution:** Use correct parameter mapping
```typescript
// Drive → condition for most models
engine.setCondition(drive / 100);

// Level → output gain
outputGain.gain.value = level / 100;
```

---

## 📊 Progress Tracking

Use the todo list:
```typescript
import { TodoWrite } from '@tools';

// Mark tasks complete as you go
TodoWrite({
  todos: [
    { content: "Migrate TB303EngineAccurate", status: "completed", activeForm: "Migrated engine" },
    { content: "Convert factory presets", status: "in_progress", activeForm: "Converting presets" },
    // ...
  ]
});
```

---

## 💡 Pro Tips

1. **Start with engine layer** - Get audio working first, UI can wait
2. **Use conversion helper** - Don't manually convert 34 presets
3. **Test each step** - Don't migrate everything at once
4. **Keep old code commented** - Easy rollback if needed
5. **Use type-check often** - Catch errors early

---

## 🎯 Success Criteria

**Minimum Viable (Phase 1):**
- [ ] Can load 2+ effects in chain
- [ ] Each effect processes audio
- [ ] Can adjust parameters
- [ ] Can enable/disable effects
- [ ] No type errors

**Full Featured (Phase 2):**
- [ ] All 34 files migrated
- [ ] All presets converted
- [ ] Full pedalboard UI
- [ ] Can add/remove effects
- [ ] Can reorder effects
- [ ] Preset management

**Advanced (Phase 3):**
- [ ] Drag-and-drop reordering
- [ ] Parallel routing
- [ ] IR loader
- [ ] MIDI control per effect

---

## 📞 Getting Help

**Read these first:**
1. `PEDALBOARD_MIGRATION_GUIDE.md` - How to migrate
2. `SESSION_SUMMARY.md` - What was built
3. `NEURAL_PEDALBOARD_DESIGN.md` - Why we built it

**Check these for reference:**
- `src/types/pedalboard.ts` - Type definitions
- `src/constants/guitarMLRegistry.ts` - Model info
- `src/engine/PedalboardEngine.ts` - Engine implementation

**Debug with:**
```bash
npm run type-check  # See all errors
console.log(pedalboard)  # Inspect state
console.log(getModelByIndex(0))  # Check model info
```

---

## ✅ Quick Wins

Want to see results fast? Do these in order:

1. **5 minutes:** Create one test preset with pedalboard
2. **30 minutes:** Update TB303EngineAccurate to use PedalboardEngine
3. **10 minutes:** Load test preset and verify audio works
4. **🎉 You now have a working multi-effect chain!**

Then continue with full migration at your own pace.

---

**Good luck! You've got a solid foundation to build on. 🚀**
