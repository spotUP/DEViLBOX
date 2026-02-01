/**
 * Akai MIDI Protocol for MPK Mini
 * 
 * Handles LCD display and RGB pad LED control via MIDI SysEx
 * Since Akai uses MIDI (not HID) for output, we send commands via Web MIDI API
 */

import { useMIDIStore } from '@/stores/useMIDIStore';

/**
 * Akai SysEx header
 */
const AKAI_SYSEX_HEADER = [0xF0, 0x47, 0x7F]; // Manufacturer ID: Akai (0x47)
const SYSEX_END = 0xF7;

/**
 * MPK Mini MK3 Commands
 */
const MPK_MINI_COMMANDS = {
  LCD_DISPLAY: 0x10,
  OLED_DISPLAY: 0x0E,  // Write OLED bitmap (from Akai Fire protocol)
  PAD_LED: 0x20,
  PROGRAM_CHANGE: 0x30,
};

/**
 * OLED Display Constants
 */
const OLED_WIDTH = 128;
const OLED_HEIGHT = 64;
const OLED_BANDS = 8; // 8 bands of 8 pixels each

/**
 * Pixel scrambling pattern for Akai OLED (from SEGGER blog)
 * Maps MIDI byte bit positions to actual display pixel positions
 */
const PIXEL_MAPPING: number[][] = [
  [13, 19, 25, 31, 37, 43, 49],
  [ 0, 20, 26, 32, 38, 44, 50],
  [ 1,  7, 27, 33, 39, 45, 51],
  [ 2,  8, 14, 34, 40, 46, 52],
  [ 3,  9, 15, 21, 41, 47, 53],
  [ 4, 10, 16, 22, 28, 48, 54],
  [ 5, 11, 17, 23, 29, 35, 55],
  [ 6, 12, 18, 24, 30, 36, 42]
];

/**
 * RGB color to velocity mapping for pad LEDs
 */
export interface PadColor {
  pad: number; // 0-7
  red: number; // 0-127
  green: number; // 0-127
  blue: number; // 0-127
}

/**
 * Send LCD display text to MPK Mini
 */
export async function sendMPKLCDDisplay(line1: string, line2: string): Promise<void> {
  const midiState = useMIDIStore.getState();
  const outputDevice = midiState.outputDevices.find((o: { name: string | null }) => o.name?.includes('MPK mini'));
  
  if (!outputDevice) {
    console.debug('[Akai MIDI] No MPK Mini output found');
    return;
  }
  
  // Get the actual MIDI output from Web MIDI API
  const midiAccess = await navigator.requestMIDIAccess({ sysex: true });
  const output = Array.from(midiAccess.outputs.values()).find(o => o.name?.includes('MPK mini'));
  
  if (!output) {
    console.debug('[Akai MIDI] No MPK Mini MIDI output available');
    return;
  }
  
  try {
    // Pad/truncate lines to 16 characters
    const text1 = line1.padEnd(16, ' ').substring(0, 16);
    const text2 = line2.padEnd(16, ' ').substring(0, 16);
    
    // Convert to ASCII bytes
    const line1Bytes = Array.from(text1).map(c => c.charCodeAt(0));
    const line2Bytes = Array.from(text2).map(c => c.charCodeAt(0));
    
    // Build SysEx message
    // Format: F0 47 7F [device] [command] [line] [data...] F7
    const sysex = new Uint8Array([
      ...AKAI_SYSEX_HEADER,
      0x49, // MPK Mini MK3 device ID
      MPK_MINI_COMMANDS.LCD_DISPLAY,
      0x00, // Line 1
      ...line1Bytes,
      0x01, // Line 2
      ...line2Bytes,
      SYSEX_END
    ]);
    
    output.send(sysex);
    console.log('[Akai MIDI] LCD updated:', text1, '|', text2);
  } catch (error) {
    console.error('[Akai MIDI] Failed to send LCD display:', error);
  }
}

/**
 * Set RGB color for a drum pad LED
 */
export async function sendMPKPadColor(pad: number, red: number, green: number, blue: number): Promise<void> {
  const midiState = useMIDIStore.getState();
  const outputDevice = midiState.outputDevices.find((o: { name: string | null }) => o.name?.includes('MPK mini'));
  
  if (!outputDevice) {
    console.debug('[Akai MIDI] No MPK Mini output found');
    return;
  }
  
  // Get the actual MIDI output from Web MIDI API
  const midiAccess = await navigator.requestMIDIAccess({ sysex: true });
  const output = Array.from(midiAccess.outputs.values()).find(o => o.name?.includes('MPK mini'));
  
  if (!output) {
    console.debug('[Akai MIDI] No MPK Mini MIDI output available');
    return;
  }
  
  if (pad < 0 || pad > 7) {
    console.error('[Akai MIDI] Invalid pad number:', pad);
    return;
  }
  
  try {
    // Clamp RGB values to 0-127
    const r = Math.max(0, Math.min(127, red));
    const g = Math.max(0, Math.min(127, green));
    const b = Math.max(0, Math.min(127, blue));
    
    // Build SysEx message for pad LED
    // Format: F0 47 7F [device] [command] [pad] [R] [G] [B] F7
    const sysex = new Uint8Array([
      ...AKAI_SYSEX_HEADER,
      0x49, // MPK Mini MK3 device ID
      MPK_MINI_COMMANDS.PAD_LED,
      pad,
      r,
      g,
      b,
      SYSEX_END
    ]);
    
    output.send(sysex);
    console.debug(`[Akai MIDI] Pad ${pad} LED set to RGB(${r}, ${g}, ${b})`);
  } catch (error) {
    console.error('[Akai MIDI] Failed to send pad LED color:', error);
  }
}

/**
 * Set multiple pad colors at once
 */
export async function sendMPKPadColors(colors: PadColor[]): Promise<void> {
  for (const color of colors) {
    await sendMPKPadColor(color.pad, color.red, color.green, color.blue);
  }
}

/**
 * Clear all pad LEDs (set to black)
 */
export async function clearMPKPadLEDs(): Promise<void> {
  const colors: PadColor[] = Array.from({ length: 8 }, (_, i) => ({
    pad: i,
    red: 0,
    green: 0,
    blue: 0
  }));
  await sendMPKPadColors(colors);
}

/**
 * Set pad LEDs to rainbow pattern (demo)
 */
export async function setMPKRainbowPattern(): Promise<void> {
  const rainbowColors = [
    { pad: 0, red: 127, green: 0, blue: 0 },      // Red
    { pad: 1, red: 127, green: 64, blue: 0 },     // Orange
    { pad: 2, red: 127, green: 127, blue: 0 },    // Yellow
    { pad: 3, red: 0, green: 127, blue: 0 },      // Green
    { pad: 4, red: 0, green: 127, blue: 127 },    // Cyan
    { pad: 5, red: 0, green: 0, blue: 127 },      // Blue
    { pad: 6, red: 64, green: 0, blue: 127 },     // Purple
    { pad: 7, red: 127, green: 0, blue: 127 },    // Magenta
  ];
  await sendMPKPadColors(rainbowColors);
}

/**
 * Map NKS light guide data to MPK pad LEDs
 */
export async function syncNKSLightsToPads(keyLights: Array<{ note: number; color: number; brightness: number }>): Promise<void> {
  // Map the first 8 key lights to the 8 drum pads
  const padColors: PadColor[] = [];
  
  for (let i = 0; i < Math.min(8, keyLights.length); i++) {
    const light = keyLights[i];
    const brightness = Math.round(light.brightness * 127);
    
    // Convert NKS color enum to RGB
    let red = 0, green = 0, blue = 0;
    
    switch (light.color) {
      case 0: // Off
        break;
      case 1: // White
        red = green = blue = brightness;
        break;
      case 2: // Red
        red = brightness;
        break;
      case 3: // Orange
        red = brightness;
        green = Math.round(brightness * 0.5);
        break;
      case 4: // Yellow
        red = green = brightness;
        break;
      case 5: // Green
        green = brightness;
        break;
      case 6: // Cyan
        green = blue = brightness;
        break;
      case 7: // Blue
        blue = brightness;
        break;
      case 8: // Purple
        red = Math.round(brightness * 0.5);
        blue = brightness;
        break;
      case 9: // Magenta
        red = blue = brightness;
        break;
    }
    
    padColors.push({ pad: i, red, green, blue });
  }
  
  await sendMPKPadColors(padColors);
}

/**
 * Convert standard bitmap to Akai's scrambled 7-bit MIDI format
 * Bitmap is 128x64 monochrome (1 bit per pixel)
 */
function convertBitmapToMIDI(bitmap: Uint8Array): Uint8Array {
  // Bitmap format: 128 pixels wide x 64 pixels tall = 1024 bytes (8192 bits)
  // Each byte contains 8 horizontal pixels
  
  const midiData: number[] = [];
  
  // Process each of the 8 bands (8 rows of 8 pixels)
  for (let band = 0; band < OLED_BANDS; band++) {
    // Each band has 128 columns
    for (let col = 0; col < OLED_WIDTH; col += 7) {
      // Process 7-pixel wide block (MIDI byte constraint: MSB=0, so 7 data bits)
      const block: number[] = new Array(8).fill(0);
      
      // Extract 8x7 pixel block from bitmap
      for (let row = 0; row < 8; row++) {
        const bitmapRow = band * 8 + row;
        const byteIndex = bitmapRow * (OLED_WIDTH / 8) + Math.floor(col / 8);
        
        for (let bitCol = 0; bitCol < 7 && (col + bitCol) < OLED_WIDTH; bitCol++) {
          const bitPos = 7 - ((col + bitCol) % 8);
          const pixel = (bitmap[byteIndex] >> bitPos) & 1;
          
          // Apply scrambling using PIXEL_MAPPING
          const refBit = PIXEL_MAPPING[row][bitCol];
          const midiByteIndex = Math.floor(refBit / 7);
          const midiBitPos = refBit % 7;
          
          if (pixel) {
            block[midiByteIndex] |= (1 << midiBitPos);
          }
        }
      }
      
      // Add block to MIDI data (8 bytes per 8x7 block)
      midiData.push(...block);
    }
  }
  
  return new Uint8Array(midiData);
}

/**
 * Send bitmap image to MPK Mini OLED display
 * @param bitmap - 128x64 monochrome bitmap (1024 bytes, 1 bit per pixel)
 */
export async function sendMPKOLEDBitmap(bitmap: Uint8Array): Promise<void> {
  if (bitmap.length !== (OLED_WIDTH * OLED_HEIGHT) / 8) {
    console.error(`[Akai MIDI] Invalid bitmap size. Expected ${(OLED_WIDTH * OLED_HEIGHT) / 8} bytes, got ${bitmap.length}`);
    return;
  }
  
  const midiState = useMIDIStore.getState();
  const outputDevice = midiState.outputDevices.find((o: { name: string | null }) => o.name?.includes('MPK mini'));
  
  if (!outputDevice) {
    console.debug('[Akai MIDI] No MPK Mini output found');
    return;
  }
  
  const midiAccess = await navigator.requestMIDIAccess({ sysex: true });
  const output = Array.from(midiAccess.outputs.values()).find(o => o.name?.includes('MPK mini'));
  
  if (!output) {
    console.debug('[Akai MIDI] No MPK Mini MIDI output available');
    return;
  }
  
  try {
    // Convert bitmap to Akai's scrambled MIDI format
    const midiData = convertBitmapToMIDI(bitmap);
    
    // Calculate payload length (14-bit value split into two 7-bit bytes)
    const payloadLength = midiData.length + 4; // +4 for band/column parameters
    const lengthHigh = (payloadLength >> 7) & 0x7F;
    const lengthLow = payloadLength & 0x7F;
    
    // Build SysEx: F0 47 7F 49 0E hh ll 00 07 00 7F [data] F7
    const sysex = new Uint8Array([
      ...AKAI_SYSEX_HEADER,
      0x49,                   // MPK Mini MK3 device ID
      MPK_MINI_COMMANDS.OLED_DISPLAY,
      lengthHigh,             // Payload length high 7 bits
      lengthLow,              // Payload length low 7 bits
      0x00,                   // Start band (0)
      0x07,                   // End band (7 = all 8 bands)
      0x00,                   // Start column (0)
      0x7F,                   // End column (127 = full width)
      ...midiData,
      SYSEX_END
    ]);
    
    output.send(sysex);
    console.log(`[Akai MIDI] OLED bitmap sent (${midiData.length} bytes)`);
  } catch (error) {
    console.error('[Akai MIDI] Failed to send OLED bitmap:', error);
  }
}

/**
 * Create a 128x64 bitmap from a 2D boolean array (for easier image creation)
 * @param pixels - 2D array [y][x] of boolean values (true = white, false = black)
 */
export function createBitmap(pixels: boolean[][]): Uint8Array {
  const bitmap = new Uint8Array((OLED_WIDTH * OLED_HEIGHT) / 8);
  
  for (let y = 0; y < OLED_HEIGHT; y++) {
    for (let x = 0; x < OLED_WIDTH; x++) {
      if (pixels[y] && pixels[y][x]) {
        const byteIndex = y * (OLED_WIDTH / 8) + Math.floor(x / 8);
        const bitPos = 7 - (x % 8);
        bitmap[byteIndex] |= (1 << bitPos);
      }
    }
  }
  
  return bitmap;
}

/**
 * Load bitmap from a canvas element (for custom graphics)
 */
export function canvasToBitmap(canvas: HTMLCanvasElement): Uint8Array {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }
  
  const imageData = ctx.getImageData(0, 0, OLED_WIDTH, OLED_HEIGHT);
  const bitmap = new Uint8Array((OLED_WIDTH * OLED_HEIGHT) / 8);
  
  for (let y = 0; y < OLED_HEIGHT; y++) {
    for (let x = 0; x < OLED_WIDTH; x++) {
      const pixelIndex = (y * OLED_WIDTH + x) * 4;
      const brightness = imageData.data[pixelIndex]; // Just use red channel
      
      if (brightness > 127) { // Threshold at 50%
        const byteIndex = y * (OLED_WIDTH / 8) + Math.floor(x / 8);
        const bitPos = 7 - (x % 8);
        bitmap[byteIndex] |= (1 << bitPos);
      }
    }
  }
  
  return bitmap;
}

/**
 * Display a test pattern on the OLED
 */
export async function sendMPKTestPattern(): Promise<void> {
  // Create a simple test pattern: border + diagonal lines
  const pixels: boolean[][] = Array(OLED_HEIGHT).fill(null).map(() => Array(OLED_WIDTH).fill(false));
  
  // Draw border
  for (let x = 0; x < OLED_WIDTH; x++) {
    pixels[0][x] = true;
    pixels[OLED_HEIGHT - 1][x] = true;
  }
  for (let y = 0; y < OLED_HEIGHT; y++) {
    pixels[y][0] = true;
    pixels[y][OLED_WIDTH - 1] = true;
  }
  
  // Draw diagonal lines
  for (let i = 0; i < Math.min(OLED_WIDTH, OLED_HEIGHT); i++) {
    pixels[i][i] = true;
    pixels[i][OLED_WIDTH - 1 - i] = true;
  }
  
  // Draw text "DEViLBOX" using simple 8x8 pixel font
  const text = "DEVILBOX";
  let xPos = 16;
  for (const char of text) {
    drawChar(pixels, char, xPos, OLED_HEIGHT / 2 - 4);
    xPos += 12;
  }
  
  const bitmap = createBitmap(pixels);
  await sendMPKOLEDBitmap(bitmap);
}

/**
 * Simple 8x8 pixel font (very basic block letters)
 */
function drawChar(pixels: boolean[][], char: string, x: number, y: number): void {
  // Very simplified character patterns
  const patterns: { [key: string]: number[] } = {
    'D': [0x7E, 0x42, 0x42, 0x42, 0x42, 0x42, 0x7E, 0x00],
    'E': [0x7E, 0x40, 0x40, 0x7C, 0x40, 0x40, 0x7E, 0x00],
    'V': [0x42, 0x42, 0x42, 0x24, 0x24, 0x18, 0x18, 0x00],
    'I': [0x3C, 0x18, 0x18, 0x18, 0x18, 0x18, 0x3C, 0x00],
    'L': [0x40, 0x40, 0x40, 0x40, 0x40, 0x40, 0x7E, 0x00],
    'B': [0x7C, 0x42, 0x42, 0x7C, 0x42, 0x42, 0x7C, 0x00],
    'O': [0x3C, 0x42, 0x42, 0x42, 0x42, 0x42, 0x3C, 0x00],
    'X': [0x42, 0x42, 0x24, 0x18, 0x24, 0x42, 0x42, 0x00],
  };
  
  const pattern = patterns[char.toUpperCase()] || patterns['O'];
  
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if ((pattern[row] >> (7 - col)) & 1) {
        const px = x + col;
        const py = y + row;
        if (px >= 0 && px < OLED_WIDTH && py >= 0 && py < OLED_HEIGHT) {
          pixels[py][px] = true;
        }
      }
    }
  }
}
