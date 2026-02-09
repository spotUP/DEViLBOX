# File Import Feature Verification Guide

This guide documents the new file import capabilities added to the instrument editors and provides instructions for verification.

## 1. Wavetable Import (Furnace & Wavetable Engines)

### Supported Editors
- **Wavetable Editor** (Generic)
- **Furnace Editor** (Chip Emulation: N163, SCC, FDS, etc.)
- **Buzzmachine Editor** (Makk M4)

### Supported Formats
- **.wav**: Standard audio files. Automatically resampled to the target length (e.g., 32 samples for Furnace, 256 for Makk M4).
- **.h**: C++ header files containing comma-separated byte arrays (common in legacy trackers/demos).
- **.fuw**: Furnace Tracker native wavetable files (Furnace Editor only).

### How to Test

#### A. Generic Wavetable Editor
1. Select a **Wavetable** instrument.
2. Open the editor.
3. Locate the **"Import Wave"** button (file upload icon) in the Wavetable list header.
4. Upload a short `.wav` file (e.g., a single cycle waveform).
5. **Verify:** The waveform display updates to match the file shape.

#### B. Furnace Chip Editor
1. Select a **Furnace** instrument (e.g., `FurnaceN163` or `FurnaceSCC`).
2. Go to the **Wavetable** tab/section.
3. Click the **"Import"** button in the wavetable list header.
4. Upload a `.wav` or `.fuw` file.
5. **Verify:** A new wavetable is added to the list with the imported data.

#### C. Buzzmachine Makk M4
1. Select a **Buzzmachine** instrument.
2. Change type to **Makk M4**.
3. Locate the **"Import Wave"** button in the Oscillator section.
4. Upload a `.wav` file.
5. **Verify:** The oscillator waveform updates.

## 2. Sample Import (Sampler & Granular)

### Supported Editors
- **Sample Editor** (Sampler, Player)
- **Granular Editor** (GranularSynth)

### Supported Formats
- **.wav, .mp3, .ogg, .flac**: Standard audio formats.

### How to Test
1. Select a **Sampler** or **GranularSynth**.
2. Drag & Drop an audio file onto the waveform area, OR click **"Replace"** / **"Upload"**.
3. **Verify:** The waveform updates, and the sound plays the new sample.

## 3. Implementation Details

- **Resampling:** Files are strictly resampled to the engine's required length (e.g. 32 samples for Furnace 4-bit) to ensure compatibility.
- **Normalization:** Imported waves are normalized to the engine's bit depth (e.g. 0-15 for 4-bit chips, 0-255 for 8-bit).
- **Persistence:** Imported data is saved as part of the instrument configuration (base64 encoded for samples, number arrays for wavetables).

## 4. Known Limitations
- **Large Files:** Importing very long samples into *Wavetable* engines (which expect single cycles) will squash the entire file into ~32 samples, creating a noisy impulse. Use *Sampler* instruments for long samples.
- **Stereo:** Wavetable imports only use the first channel (mono).
