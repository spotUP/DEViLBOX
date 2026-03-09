---
name: edit-pattern
description: "Edit tracker patterns — write notes, sequences, fills, batch operations"
---

# /edit-pattern — Pattern Editing

Read and write tracker pattern data programmatically.

## Usage

```
/edit-pattern <action> [options]
```

Examples:
- `/edit-pattern show` — Render current pattern as ASCII
- `/edit-pattern write C-4 E-4 G-4 on channel 0` — Write notes
- `/edit-pattern fill channel 1 with kick snare pattern`
- `/edit-pattern clear channel 3`

## Reading Patterns

### View as ASCII Text
```
render_pattern_text(patternIndex: 0)
render_pattern_text(patternIndex: 0, startRow: 0, endRow: 15, channels: [0, 1])
```

### Get Pattern Data
```
get_pattern(patternIndex: 0, compact: true)     // Skip empty rows
get_cell(patternIndex: 0, channel: 0, row: 0)   // Single cell
get_channel_column(patternIndex: 0, channel: 0)  // Full channel
get_pattern_list                                  // All patterns
get_pattern_order                                 // Song arrangement
```

### Search & Analyze
```
search_pattern(patternIndex: 0, note: "C-4")                    // Find note
search_pattern(patternIndex: 0, instrument: 1)                   // Find instrument
get_pattern_stats(patternIndex: 0)                                // Density, usage stats
validate_pattern(patternIndex: 0)                                 // Check for issues
diff_patterns(patternA: 0, patternB: 1)                          // Compare patterns
```

## Writing Patterns

### Single Cell
```
set_cell(channel: 0, row: 0, note: "C-4", instrument: 1, volume: 64)
set_cell(channel: 0, row: 4, note: "OFF")      // Note off
clear_cell(channel: 0, row: 8)                   // Clear
```

Note format: `"C-4"`, `"F#3"`, `"A-2"`, `"OFF"`, or numeric 1-96 (97=OFF).

### Multiple Cells (Batch)
```
set_cells(cells: [
  {channel: 0, row: 0, note: "C-4", instrument: 1},
  {channel: 0, row: 4, note: "E-4", instrument: 1},
  {channel: 0, row: 8, note: "G-4", instrument: 1}
])
```

### Note Sequence
```
write_note_sequence(
  channel: 0,
  startRow: 0,
  step: 4,
  notes: ["C-4", "E-4", "G-4", "C-5", "G-4", "E-4"],
  instrument: 1
)
```

### Fill Range
```
fill_range(channel: 0, startRow: 0, endRow: 63,
  cell: {note: "C-2", instrument: 2}, step: 8)
```

### Batch Operations (Atomic)
```
batch(operations: [
  {tool: "set_cell", args: {channel: 0, row: 0, note: "C-4", instrument: 1}},
  {tool: "set_cell", args: {channel: 0, row: 4, note: "E-4", instrument: 1}},
  {tool: "set_cell", args: {channel: 1, row: 0, note: "C-2", instrument: 2}}
])
```

## Pattern Management

```
add_pattern                          // Add empty pattern
duplicate_pattern(patternIndex: 0)   // Clone pattern
resize_pattern(patternIndex: 0, length: 128)  // Change row count
clear_pattern(patternIndex: 0)       // Clear all data
clear_channel(patternIndex: 0, channel: 0)    // Clear one channel
```

## Pattern Order (Song Arrangement)

```
get_pattern_order                            // Current order
set_pattern_order(order: [0, 1, 0, 2])      // Set full order
add_to_order(patternIndex: 1, position: 2)   // Insert at position
remove_from_order(position: 3)               // Remove position
```

## Row/Channel Operations

```
insert_row(patternIndex: 0, row: 8)    // Insert row, shift down
delete_row(patternIndex: 0, row: 8)    // Delete row, shift up
swap_channels(a: 0, b: 3)              // Swap two channels
```

## Transforms on Selection

```
select_range(startChannel: 0, startRow: 0, endChannel: 0, endRow: 31)
transpose_selection(semitones: 7)       // Transpose up a 5th
interpolate_selection(column: "volume") // Smooth volume gradient
humanize_selection(amount: 0.15)        // Random velocity variation
scale_volume(factor: 0.8)              // Scale volume to 80%
fade_volume(from: 64, to: 0)           // Fade out
```
