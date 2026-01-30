# MOD/XM Import/Export Test Suite

Comprehensive test suite for the native MOD/XM import and export system.

## Test Coverage

### XMParser Tests (`XMParser.test.ts`)
- ✅ **Header Parsing**: XM signature validation, version detection, channel/pattern/instrument counts
- ✅ **Pattern Parsing**: Note data, empty rows, bit-flag decompression
- ✅ **Instrument Parsing**: Multi-sample instruments, volume envelopes, panning envelopes, auto-vibrato
- ✅ **Sample Data**: Delta-encoded samples, 8/16-bit PCM, loop points
- ✅ **Import Metadata**: Preservation of original data for lossless re-export
- ✅ **Edge Cases**: Truncated files, max channels (32), max patterns (256), empty instruments

### MODParser Tests (`MODParser.test.ts`)
- ✅ **Header Parsing**: Format tags (M.K., 6CHN, 8CHN, FLT4, FLT8), channel detection
- ✅ **Sample Parsing**: 31 samples, loop points, finetune, volume, 8-bit signed PCM
- ✅ **Pattern Parsing**: 64-row patterns, Amiga period to note conversion, effects
- ✅ **Period Conversion**: All notes C-0 to B-3, rounding, invalid values
- ✅ **Import Metadata**: Preservation of MOD-specific data
- ✅ **Edge Cases**: Empty samples, max patterns (128), truncated files

### Import/Export Flow Tests (`ImportExportFlow.test.ts`)
- ✅ **XM Round-Trip**: Lossless import and re-export
- ✅ **MOD Round-Trip**: Lossless import and re-export
- ✅ **Effect Preservation**: FT2 effects pass through unchanged
- ✅ **Sample Preservation**: Loop points, finetune, relative note preserved
- ✅ **Envelope Preservation**: Point-based envelopes to ADSR and back
- ✅ **Cross-Format Warnings**: XM→MOD channel/row truncation, synth→sample conversion
- ✅ **Metadata System**: Import metadata enables lossless export
- ✅ **Edge Cases**: Empty patterns, no instruments, max channels

## Running Tests

### Run All Tests
```bash
npm test src/lib/import/__tests__
```

### Run Specific Test File
```bash
npm test src/lib/import/__tests__/XMParser.test.ts
npm test src/lib/import/__tests__/MODParser.test.ts
npm test src/lib/import/__tests__/ImportExportFlow.test.ts
```

### Run Tests in Watch Mode
```bash
npm test -- --watch src/lib/import/__tests__
```

### Generate Coverage Report
```bash
npm test -- --coverage src/lib/import
```

## Test Structure

Each test file follows the same structure:

```typescript
describe('ComponentName', () => {
  describe('Feature Group', () => {
    it('should test specific behavior', async () => {
      // Arrange
      const input = createTestData();

      // Act
      const result = await functionUnderTest(input);

      // Assert
      expect(result).toMatchExpectedOutput();
    });
  });
});
```

## Helper Functions

Test files include helper functions to create test data:

### XMParser Helpers
- `createMinimalXM()` - Creates minimal valid XM file
- `createXMWithPattern()` - XM with specific pattern data
- `createXMWithInstrument()` - XM with instrument and samples
- `createXMWithEnvelope()` - XM with volume/panning envelope
- `createXMWithCompressedPattern()` - XM with bit-flag compression

### MODParser Helpers
- `createMinimalMOD()` - Creates minimal valid MOD file
- `createMODWithSamples()` - MOD with sample data
- `createMODWithPattern()` - MOD with specific pattern
- `createMODWithPatternOrder()` - MOD with custom pattern sequence

### Integration Test Helpers
- `createTestXM()` - Generic XM for round-trip tests
- `createTestMOD()` - Generic MOD for round-trip tests
- `createXMWithEffects()` - XM with FT2 effects for preservation tests

## Test Data

Test files use synthetic data instead of real MOD/XM files for:
- **Speed**: No need to load large binary files
- **Isolation**: Tests are not dependent on external files
- **Clarity**: Test data is minimal and focused on specific features
- **Reliability**: No risk of test file corruption

## Coverage Goals

Target coverage for import/export system:

| Category | Target | Current |
|----------|--------|---------|
| Line Coverage | 90%+ | TBD |
| Branch Coverage | 85%+ | TBD |
| Function Coverage | 95%+ | TBD |

## Adding New Tests

When adding features to the import/export system, follow this checklist:

1. **Parser Tests**
   - [ ] Test new format support (header/pattern/instrument parsing)
   - [ ] Test edge cases (truncated data, invalid values)
   - [ ] Test error handling

2. **Converter Tests**
   - [ ] Test data transformation (periods, envelopes, effects)
   - [ ] Test metadata preservation
   - [ ] Test lossless conversion where applicable

3. **Integration Tests**
   - [ ] Test round-trip import/export
   - [ ] Test cross-format conversion warnings
   - [ ] Test with real-world test files (optional)

## Known Limitations

These tests use simplified test data. For production validation:

1. **Use Real Tracker Files**: Test with actual MOD/XM files from ModArchive
2. **Binary Comparison**: Compare re-exported files byte-by-byte where possible
3. **Audio Comparison**: Use FFT analysis to verify playback accuracy
4. **Manual Testing**: Listen to imported modules to catch subjective issues

## Related Documentation

- `/docs/FT2_EFFECTS.md` - FT2 effect command reference
- `/docs/MOD_XM_IMPORT_IMPLEMENTATION.md` - Full implementation details
- `/docs/MOD_XM_IMPORT_QUICKSTART.md` - Developer quick start guide

## Troubleshooting

### Test Failures

**"Invalid XM file" error**
- Check that `createMinimalXM()` generates valid header signature
- Verify header size and offsets match XM specification

**Period conversion fails**
- Verify Amiga period table is complete (C-0 to B-3)
- Check for off-by-one errors in period lookup

**Envelope conversion inaccurate**
- Check tick-to-millisecond conversion (50 Hz PAL, 60 Hz NTSC)
- Verify ADSR approximation algorithm

**Round-trip export differs from import**
- Check if import metadata is being preserved
- Verify lossless export path is being used
- Look for data type conversions (8-bit to 16-bit, etc.)

## Future Enhancements

- [ ] Add benchmark tests for parse performance
- [ ] Add tests for IT/S3M formats (when implemented)
- [ ] Add visual regression tests for pattern editor
- [ ] Add audio playback accuracy tests (FFT comparison)
- [ ] Add fuzzing tests for crash resistance

---

**Last Updated:** 2026-01-22
**Test Framework:** Vitest
**Coverage Tool:** v8 (default with Vitest)
