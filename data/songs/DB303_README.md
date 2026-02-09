# DB303 XML Presets and Patterns

This directory contains DB303 preset and pattern files in XML format, compatible with db303.pages.dev.

## Files

- **db303-default-preset.xml** - Default DB303 preset with all 64 parameters
  - Includes oscillator, filter, Devil Fish, LFO, and effects settings
  - Can be imported via the IMPORT button in the JC303/DB303 panel

- **db303-default-pattern.xml** - Default 16-step TB-303 pattern
  - Contains step sequencer data for creating acid basslines
  - Future feature: pattern import/playback

## Usage

### Importing a Preset

1. Open DEViLBOX and select a DB303 or JC303 instrument
2. Click the **IMPORT** button in the top control bar
3. Select a `.xml` preset file
4. The preset will be loaded with all parameters applied

### Exporting a Preset

1. Configure your DB303/JC303 sound with the desired parameters
2. Click the **EXPORT** button in the top control bar
3. A `.xml` file will be downloaded with all current settings
4. This file can be shared or imported later

## XML Format

The DB303 XML format includes:
- **Oscillator**: Waveform, PWM, sub-oscillator
- **Filter**: Cutoff, resonance, envelope mod, decay
- **Devil Fish**: 10+ extended parameters (oversampling, duffing, ensemble, etc.)
- **LFO**: Waveform, rate, modulation depths (pitch, PWM, filter)
- **Chorus**: Mode, mix
- **Phaser**: Rate, width, feedback, mix
- **Delay**: Time, feedback, tone, mix, spread

All parameters use normalized values (0-1) in the XML, which are automatically converted to the appropriate ranges when imported.

## Compatibility

These XML files are fully compatible with:
- db303.pages.dev (reference implementation)
- DEViLBOX DB303/JC303 engines
- Any other software that supports the db303 XML preset format

## Creating Your Own Presets

1. Design your sound using the UI controls
2. Export as XML
3. Edit the XML file if needed (advanced users)
4. Share with others or import back into DEViLBOX

Enjoy creating acid basslines! 🎹🔥
