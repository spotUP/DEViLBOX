# PSA (Professional Sound Artists) layout, from PSA_v2.asm

- Header: 0x24 file size, 0x28 instrument table (64 B each), 0x2C position table (u16 pattern indices),
  0x30 first pattern; subsong n at 0x38+8n: u16 start, end, restart (byte offsets into position table).
- Pattern = 1024 bytes: 64 rows x 4 voices x 4 bytes [note, inst(0-based), effect, param]; pattern at 0x30 + idx*1024.
- note = 1-based index into 37-entry period table (856..107): grid note = idx+12 (856 = C-1 = 13).
- effect bit7 = set period only (kept via encodeOverStored); effects 3,5,12,13,15 handled by player.
- Code: PSAParser.ts, engine/uade/encoders/PSAEncoder.ts, registry line "psa" fixed, test engine/__tests__/psaEditable.test.ts.
- Not done: instruments still placeholders; octave not measured against UADE Paula log (table mapping only); generic layout export path not verified end to end.
