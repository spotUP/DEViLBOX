/**
 * Klystrack adapter — Reference implementation for format adapters.
 *
 * This file shows the pattern used across all format adapters.
 * The actual klysAdapter.ts is already integrated into KlysView.
 *
 * Pattern for creating a new format adapter:
 *
 * 1. Define column layout (COLUMNS export)
 *    - One ColumnDef per column displayed in pattern editor
 *    - Set type: 'note' | 'hex' | 'ctrl' to control keyboard input
 *    - Define formatter() to display values
 *
 * 2. Define conversion function (toFormatChannels export)
 *    - Maps native format data → FormatCell[] rows
 *    - Returns FormatChannel[] (one per channel)
 *    - Each channel has label, patternLength, and rows array
 *
 * 3. Update the format's View component to:
 *    - Import columns and conversion function from adapter
 *    - Compute channels: const channels = useMemo(() => adapter(...), [deps])
 *    - Create handleCellChange callback to write edits back
 *    - Use GenericFormatView with columns, channels, onCellChange
 *
 * Reference: src/components/klystrack/klysAdapter.ts
 */

export const EXAMPLE_PATTERN = `
// Column definitions
export const KLYS_COLUMNS: ColumnDef[] = [
  {
    key: 'note',
    label: 'Note',
    charWidth: 3,
    type: 'note',
    color: '#e0e0e0',
    emptyColor: '#333',
    emptyValue: 0xFF,
    formatter: noteToString,
  },
  // ... more columns
];

// Conversion function
export function klysToFormatChannels(
  nativeData: KlysNativeData,
  currentPosition: number
): FormatChannel[] {
  // For each channel:
  // 1. Find the active pattern at currentPosition from sequences
  // 2. Map pattern.steps to FormatCell[] using column keys
  // 3. Return FormatChannel with label, patternLength, rows

  return [
    {
      label: 'CH01:P000',
      patternLength: 64,
      rows: [
        { note: 0, instrument: 0xFF, ctrl: 0, volume: 0xFF, command: 0 },
        // ...
      ]
    }
  ];
}
`;
