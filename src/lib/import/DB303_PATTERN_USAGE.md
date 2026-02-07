# DB303 Pattern Import/Export Usage

The pattern converter utilities are ready to use but require integration with the tracker UI.

## Available Functions

### `parseDb303Pattern(xmlString, patternName?): Pattern`

Converts a db303 XML pattern to DEViLBOX Pattern format.

```typescript
import { parseDb303Pattern } from '@lib/import/Db303PatternConverter';

// Read XML file
const xmlString = await fetch('/data/songs/db303-default-pattern.xml').then(r => r.text());

// Parse to Pattern
const pattern = parseDb303Pattern(xmlString, 'My Pattern');

// Pattern can now be added to the tracker
// Example: useTrackerStore.getState().addPattern(pattern);
```

### `convertToDb303Pattern(pattern): string`

Converts a DEViLBOX Pattern to db303 XML format.

```typescript
import { convertToDb303Pattern } from '@lib/import/Db303PatternConverter';

// Get current pattern from tracker
const pattern = useTrackerStore.getState().patterns[0];

// Convert to XML
const xml = convertToDb303Pattern(pattern);

// Download as file
const blob = new Blob([xml], { type: 'application/xml' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'my-pattern.xml';
a.click();
```

### `createEmptyDb303Pattern(numSteps?, name?): Pattern`

Creates an empty pattern with the specified number of steps.

```typescript
import { createEmptyDb303Pattern } from '@lib/import/Db303PatternConverter';

// Create 16-step pattern
const pattern = createEmptyDb303Pattern(16, 'New 303 Pattern');
```

## Pattern Format

### DB303 XML Format

```xml
<?xml version="1.0" encoding="UTF-8"?>
<db303-pattern version="1.0" numSteps="16">
  <step index="0" key="0" octave="0" gate="true" accent="false" slide="false"/>
  <step index="1" key="0" octave="-1" gate="true" accent="false" slide="true"/>
  <!-- ... more steps ... -->
</db303-pattern>
```

**Step Attributes:**
- `index`: 0-31 (step number)
- `key`: 0-11 (C=0, C#=1, D=2, ..., B=11)
- `octave`: -2 to +2 (relative to base octave)
- `gate`: true/false (note on/off)
- `accent`: true/false (TB-303 accent)
- `slide`: true/false (TB-303 slide/glide)

### DEViLBOX Pattern Format

```typescript
interface Pattern {
  id: string;
  name: string;
  length: number; // 16, 32, etc.
  channels: ChannelData[];
}

interface TrackerCell {
  note: number;        // 0 = empty, 1-96 = notes (C-0=1, C#0=2, etc.)
  instrument: number;  // 0 = none
  volume: number;
  effTyp: number;
  eff: number;
  effTyp2: number;
  eff2: number;
  accent?: boolean;    // TB-303 accent
  slide?: boolean;     // TB-303 slide
}
```

## Note Conversion

DB303 uses a key + octave system, while DEViLBOX uses absolute note numbers.

**DB303 → DEViLBOX:**
- db303 octave 0 maps to tracker octave 3 (C-3)
- Formula: `note = (octave + 3) * 12 + key + 1`
- Example: key=0, octave=0 → C-3 = 37

**DEViLBOX → DB303:**
- Tracker octave 3 maps to db303 octave 0
- Formula: `octave = floor(note / 12) - 3`, `key = note % 12`
- Example: C-3 (37) → key=0, octave=0

## Integration with Tracker UI

To add pattern import/export buttons to the tracker:

1. Add buttons to `TrackerToolbar` or `PatternEditor` component
2. Use file input for import
3. Use blob download for export
4. Call `useTrackerStore` methods to add/update patterns

Example:

```typescript
// In TrackerToolbar.tsx or similar
import { parseDb303Pattern, convertToDb303Pattern } from '@lib/import/Db303PatternConverter';
import { useTrackerStore } from '@stores/useTrackerStore';

const handleImportPattern = () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xml';
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const xmlString = await file.text();
    const pattern = parseDb303Pattern(xmlString, file.name.replace('.xml', ''));

    // Add to tracker
    useTrackerStore.getState().addPattern(pattern);
  };
  input.click();
};

const handleExportPattern = () => {
  const currentPattern = useTrackerStore.getState().patterns[0];
  const xml = convertToDb303Pattern(currentPattern);

  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${currentPattern.name}.xml`;
  a.click();
  URL.revokeObjectURL(url);
};
```

## Testing

The converter has been tested with:
- `db303-default-pattern.xml` - 16-step acid bassline pattern
- Round-trip conversion (import → export → import)
- Edge cases (empty steps, various octaves)

## Future Enhancements

- UI buttons in tracker toolbar
- Drag-and-drop XML import
- Pattern library browser
- Multi-pattern import (batch)
- Pattern preview before import
