# Akai MPK Mini MK3 OLED Custom Screensaver Guide

## Display Specifications

- **Type**: Monochrome OLED (graphical display, not character LCD)
- **Resolution**: 128×64 pixels
- **Color Depth**: 1-bit (black/white only)
- **Protocol**: MIDI SysEx (based on Akai Fire OLED protocol)
- **Refresh Rate**: ~10-20 Hz

## Upload Custom Images

### Via UI (Easiest Method)

1. **Connect your MPK Mini** via MIDI → Toolbar dropdown
2. **Scroll to "NKS Panel"** in the MIDI menu
3. **Click "Upload Custom Image"** button (purple, camera icon)
4. **Select any image** from your computer
   - Supported formats: JPG, PNG, GIF, BMP, etc.
   - Any size (will be auto-scaled to 128×64)
   - Color images automatically converted to monochrome

The image will be:
- Scaled proportionally to fit 128×64
- Centered on the display
- Converted to pure black & white (threshold at 50% brightness)

### Via Code (Advanced)

```typescript
import { sendMPKOLEDBitmap, createBitmap, canvasToBitmap } from '@/midi/nks/AkaiMIDIProtocol';

// Method 1: From 2D boolean array
const pixels: boolean[][] = Array(64).fill(null).map(() => Array(128).fill(false));
// Draw your custom graphics...
pixels[32][64] = true; // Set a pixel at center
const bitmap = createBitmap(pixels);
await sendMPKOLEDBitmap(bitmap);

// Method 2: From Canvas element
const canvas = document.createElement('canvas');
canvas.width = 128;
canvas.height = 64;
const ctx = canvas.getContext('2d')!;
// Draw on canvas...
ctx.fillStyle = 'white';
ctx.fillRect(0, 0, 128, 64);
const bitmap = canvasToBitmap(canvas);
await sendMPKOLEDBitmap(bitmap);

// Method 3: Test pattern (built-in)
import { sendMPKTestPattern } from '@/midi/nks/AkaiMIDIProtocol';
await sendMPKTestPattern();
```

## Creating Custom Screensaver Images

### Recommended Tools

1. **Image Editors**:
   - Photoshop: Create 128×64 canvas, export as PNG
   - GIMP: Free alternative, same workflow
   - Figma/Sketch: Export artboard at 128×64

2. **Pixel Art Tools**:
   - Piskel (free, web-based): https://www.piskelapp.com/
   - Aseprite (paid): Best for pixel art animation
   - Paint.NET (Windows, free)

3. **Online Converters**:
   - https://doodad.dev/dither-me-this/ (good for dithering photos)
   - https://www.online-image-editor.com/ (resize + threshold)

### Design Tips

1. **Start with the right size**: 128×64 pixels saves conversion hassle
2. **High contrast works best**: Pure black/white, avoid gradients
3. **Bold lines**: Minimum 2px line width for visibility
4. **Large text**: Minimum 8px font height
5. **Test with photos**: Dithering creates interesting effects!

### Example Workflow (Photoshop)

```
1. New File → 128×64 pixels
2. Mode → Grayscale → Bitmap (50% Threshold)
3. Draw your graphics
4. File → Export → PNG
5. Upload via NKS Panel in DEViLBOX
```

## Technical Details

### Bitmap Format

- **Size**: 1024 bytes (128×64÷8)
- **Format**: Row-major, 1 bit per pixel
- **Byte structure**: Each byte = 8 horizontal pixels (MSB = leftmost)
- **Black pixels**: 0 bit
- **White pixels**: 1 bit

### SysEx Protocol

Based on reverse-engineering by SEGGER (Akai Fire):

```
F0 47 7F 49 0E hh ll 00 07 00 7F [bitmap_data] F7

F0    = SysEx start
47    = Akai manufacturer ID
7F    = All-call address
49    = MPK Mini MK3 device ID
0E    = "Write OLED" command
hh ll = Payload length (14-bit, split into 7-bit MIDI bytes)
00    = Start band (0)
07    = End band (7 = all 8 bands of 8 pixels)
00    = Start column (0)
7F    = End column (127 = full width)
[...]  = Scrambled bitmap data (7-bit MIDI format)
F7    = SysEx end
```

### Pixel Scrambling

Akai uses a non-intuitive pixel mapping for OLED efficiency. Each 8×7 pixel block is scrambled using this pattern:

```
Display positions → MIDI byte bit positions
Row 0: 13, 19, 25, 31, 37, 43, 49
Row 1:  0, 20, 26, 32, 38, 44, 50
Row 2:  1,  7, 27, 33, 39, 45, 51
Row 3:  2,  8, 14, 34, 40, 46, 52
Row 4:  3,  9, 15, 21, 41, 47, 53
Row 5:  4, 10, 16, 22, 28, 48, 54
Row 6:  5, 11, 17, 23, 29, 35, 55
Row 7:  6, 12, 18, 24, 30, 36, 42
```

The `convertBitmapToMIDI()` function handles this automatically.

## Animation Support

While not yet implemented, you can create animated screensavers by:

1. Creating multiple frame bitmaps
2. Sending them sequentially with ~50ms delay
3. Looping the sequence

Example:
```typescript
const frames = [frame1Bitmap, frame2Bitmap, frame3Bitmap];
setInterval(() => {
  const frame = frames[frameIndex++ % frames.length];
  sendMPKOLEDBitmap(frame);
}, 50); // 20 FPS
```

## Troubleshooting

**Issue**: Image not appearing
- **Fix**: Check MIDI output is connected (NKS panel shows "Connected")
- **Fix**: Try "Test Pattern" button first to verify OLED works

**Issue**: Image looks scrambled
- **Fix**: Bitmap scrambling is handled automatically - don't convert manually

**Issue**: Image too dark/bright
- **Fix**: Adjust brightness in image editor before upload
- **Fix**: Use 50% threshold for best results

**Issue**: Text unreadable
- **Fix**: Use larger fonts (min 8px)
- **Fix**: Increase contrast (pure black on white)

## References

- [SEGGER Blog: Decoding Akai Fire Part 3](https://blog.segger.com/decoding-the-akai-fire-part-3/)
- [Akai Fire SysEx Examples](https://blog.segger.com/wp-content/uploads/2019/01/AkaiFireSysex.zip)
- Implementation: `src/midi/nks/AkaiMIDIProtocol.ts`
