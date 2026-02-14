# DB303 Pattern Library

This directory contains example TB-303 patterns in db303.pages.dev XML format.

## How to Import

1. Open DEViLBOX in your browser
2. Create or select a JC303/DB303 instrument
3. Click the **"Import 303"** button in the toolbar
4. Select one of these XML files
5. The pattern will be loaded into the tracker

## Available Patterns

### `db303-default-pattern.xml`
The default pattern from db303.pages.dev - simple demonstration pattern.

### `acid-bassline.xml`
Classic acid house bassline with accents and slides.
- Key: C
- Features: Accented notes on beats 1, 6, 12
- Slides: On steps 3→4 and 11→12

### `classic-303.xml`
Traditional TB-303 sequence with lower octave.
- Key: C (lower octave)
- Features: Walking bassline pattern
- Slides: Smooth transitions between notes

### `sliding-sequence.xml`
Chromatic sliding sequence showcasing the slide feature.
- Key: C
- Features: Continuous slides, chromatic motion
- Good for testing filter envelope and slide behavior

## Pattern Format

DB303 patterns use the following XML structure:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<db303-pattern version="1.0" numSteps="16">
  <step index="0" key="0" octave="0" gate="true" accent="true" slide="false"/>
  <!-- ... more steps -->
</db303-pattern>
```

### Parameters

- **index**: Step number (0-31 for 32-step patterns)
- **key**: Note (0=C, 1=C#, 2=D, ..., 11=B)
- **octave**: Octave offset (-2 to +2)
- **gate**: Note on/off (true/false)
- **accent**: Accent enabled (true/false)
- **slide**: Slide to next note (true/false)

## Creating Your Own

You can create patterns using:
1. **db303.pages.dev** - Web-based pattern editor
2. **Text editor** - Hand-code XML following the format above
3. **DEViLBOX Export** - Use "Export 303" to save your patterns

## More Patterns

Visit https://db303.pages.dev for more patterns and a visual pattern editor.
