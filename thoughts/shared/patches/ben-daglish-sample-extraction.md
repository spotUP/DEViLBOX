---
date: 2026-04-06
topic: ben-daglish-sample-extraction
status: pending-apply
---

# Ben Daglish Sample Extraction Patch

Apply to `src/lib/import/formats/BenDaglishParser.ts` when other agents are done editing it.

## Changes

### 1. Add import
After existing imports, add:
```typescript
import { createSamplerInstrument } from './AmigaUtils';
```

### 2. Replace instrument placeholder section
Replace the "Instrument placeholders" section (the `for` loop creating 8 placeholder instruments) with sample extraction that:
- Follows BRA at offset 0 to find player init code
- Scans for `D040 D040 D040 41FA` opcode sequence
- Extracts SampleInfo1 via PC-relative LEA displacement
- Reads null-terminated longword offset table
- For each sample descriptor: extracts PCM data (raw or IFF 8SVX BODY chunk)
- Creates `createSamplerInstrument()` with proper loop points
- Falls back to placeholders if extraction fails

### 3. Add to return object
```typescript
uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
uadeEditableFileName: filename,
```

## Algorithm (from Benn Daglishv3.asm InitPlayer)
1. `braTarget = 2 + u16BE(buf, 2)` — follow BRA displacement
2. Scan from braTarget for `D040 D040 D040 41FA` (3x ADD.W + LEA pc-rel)
3. `sampleInfo1Off = (scanPos + 8) + 2 + signedDisp(scanPos + 8)`
4. Read longword table at sampleInfo1Off: each entry = offset to descriptor
5. Descriptor at (sampleInfo1Off + entry):
   - `+0` u32: PCM data offset from sampleInfo1Off
   - `+4` u32: loop start offset from sampleInfo1Off
   - `+8` u16: sample length in words
   - `+10` u16: loop tail length in words
6. If PCM starts with "FORM" → IFF 8SVX, find BODY chunk
7. Otherwise → raw signed 8-bit PCM

## Tested with
- `motorhead-titleandingame.bd` — 10 samples extracted
- 85 total .bd files in Reference Music collection
