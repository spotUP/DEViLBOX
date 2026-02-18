/**
 * WaveformProcessor - Destructive audio buffer operations
 * 
 * All methods return NEW AudioBuffer instances (non-destructive to input).
 * Used by SampleEditor for cut/copy/paste, fade, normalize, etc.
 */

export class WaveformProcessor {

  // ─── Helper: create buffer ───────────────────────────────────────────
  private static createBuffer(length: number, channels: number, sampleRate: number): AudioBuffer {
    return new AudioBuffer({ length: Math.max(1, length), numberOfChannels: channels, sampleRate });
  }

  private static copyRegion(src: AudioBuffer, dst: AudioBuffer, srcStart: number, dstStart: number, count: number): void {
    for (let ch = 0; ch < src.numberOfChannels; ch++) {
      const s = src.getChannelData(ch);
      const d = dst.getChannelData(ch);
      for (let i = 0; i < count; i++) {
        d[dstStart + i] = s[srcStart + i];
      }
    }
  }

  // ─── Basic operations ────────────────────────────────────────────────

  /**
   * Reverse an AudioBuffer (full)
   */
  public static reverse(buffer: AudioBuffer): AudioBuffer {
    const { numberOfChannels: ch, length, sampleRate } = buffer;
    const out = this.createBuffer(length, ch, sampleRate);
    for (let c = 0; c < ch; c++) {
      const inp = buffer.getChannelData(c);
      const o = out.getChannelData(c);
      for (let i = 0; i < length; i++) o[i] = inp[length - 1 - i];
    }
    return out;
  }

  /**
   * Reverse only a range within the buffer
   */
  public static reverseRange(buffer: AudioBuffer, start: number, end: number): AudioBuffer {
    const { numberOfChannels: ch, length, sampleRate } = buffer;
    const out = this.createBuffer(length, ch, sampleRate);
    for (let c = 0; c < ch; c++) {
      const inp = buffer.getChannelData(c);
      const o = out.getChannelData(c);
      // Copy prefix
      for (let i = 0; i < start; i++) o[i] = inp[i];
      // Reverse range
      const rangeLen = end - start;
      for (let i = 0; i < rangeLen; i++) o[start + i] = inp[end - 1 - i];
      // Copy suffix
      for (let i = end; i < length; i++) o[i] = inp[i];
    }
    return out;
  }

  /**
   * Normalize an AudioBuffer to peak = 1.0
   */
  public static normalize(buffer: AudioBuffer): AudioBuffer {
    const { numberOfChannels: ch, length, sampleRate } = buffer;
    let maxVal = 0;
    for (let c = 0; c < ch; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < length; i++) {
        const abs = Math.abs(data[i]);
        if (abs > maxVal) maxVal = abs;
      }
    }
    if (maxVal === 0 || maxVal === 1.0) return buffer;
    const scale = 1.0 / maxVal;
    const out = this.createBuffer(length, ch, sampleRate);
    for (let c = 0; c < ch; c++) {
      const inp = buffer.getChannelData(c);
      const o = out.getChannelData(c);
      for (let i = 0; i < length; i++) o[i] = inp[i] * scale;
    }
    return out;
  }

  /**
   * Normalize only a range within the buffer
   */
  public static normalizeRange(buffer: AudioBuffer, start: number, end: number): AudioBuffer {
    const { numberOfChannels: ch, length, sampleRate } = buffer;
    let maxVal = 0;
    for (let c = 0; c < ch; c++) {
      const data = buffer.getChannelData(c);
      for (let i = start; i < end; i++) {
        const abs = Math.abs(data[i]);
        if (abs > maxVal) maxVal = abs;
      }
    }
    if (maxVal === 0 || maxVal === 1.0) return buffer;
    const scale = 1.0 / maxVal;
    const out = this.createBuffer(length, ch, sampleRate);
    for (let c = 0; c < ch; c++) {
      const inp = buffer.getChannelData(c);
      const o = out.getChannelData(c);
      for (let i = 0; i < length; i++) {
        o[i] = (i >= start && i < end) ? inp[i] * scale : inp[i];
      }
    }
    return out;
  }

  /**
   * AmigaPal 8-bit conversion - Perfect Amiga samples!
   *
   * Algorithm from AmigaPal by echolevel (https://github.com/echolevel/AmigaPal):
   * 1. Normalize to peak (maximizes SNR before conversion)
   * 2. Convert to 8-bit signed (-128 to 127) with proper rounding
   * 3. Apply bit-depth quantization for authentic Amiga sound
   *
   * Perfect for ProTracker MODs and retro game audio!
   */
  public static amigaPal8Bit(buffer: AudioBuffer): AudioBuffer {
    const { numberOfChannels: ch, length, sampleRate } = buffer;

    // Step 1: Find peak for normalization (AmigaPal lines 821-824)
    let peak = 0;
    for (let c = 0; c < ch; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < length; i++) {
        const abs = Math.abs(data[i]);
        if (abs > peak) peak = abs;
      }
    }

    const out = this.createBuffer(length, ch, sampleRate);

    // Step 2: Normalize and convert to 8-bit for each channel
    for (let c = 0; c < ch; c++) {
      const inp = buffer.getChannelData(c);
      const o = out.getChannelData(c);

      for (let i = 0; i < length; i++) {
        // Normalize to peak (AmigaPal line 827)
        let normalized = peak > 0 ? inp[i] / peak : inp[i];

        // Clamp to -1 to 1 (AmigaPal lines 828-832)
        normalized = Math.max(-1, Math.min(1, normalized));

        // Convert to 8-bit signed: multiply by 128 and round (AmigaPal line 839)
        let int8 = Math.round(normalized * 128);

        // Clamp to 8-bit range (AmigaPal lines 840-845)
        int8 = Math.max(-128, Math.min(127, int8));

        // Convert back to float32 with 8-bit quantization
        // This simulates the bit-depth reduction (AmigaPal lines 886-887)
        const step = Math.pow(0.5, 8); // 1/256
        o[i] = step * Math.floor((int8 / 128) / step);
      }
    }

    return out;
  }

  /**
   * Invert phase in loop area (Destructive EFx)
   */
  public static invertLoop(buffer: AudioBuffer, start: number, end: number): AudioBuffer {
    const { numberOfChannels: ch, length, sampleRate } = buffer;
    const out = this.createBuffer(length, ch, sampleRate);
    for (let c = 0; c < ch; c++) {
      const inp = buffer.getChannelData(c);
      const o = out.getChannelData(c);
      for (let i = 0; i < start; i++) o[i] = inp[i];
      for (let i = start; i < end && i < length; i++) o[i] = -inp[i];
      for (let i = end; i < length; i++) o[i] = inp[i];
    }
    return out;
  }

  /**
   * Apply gain to entire buffer
   */
  public static applyGain(buffer: AudioBuffer, gain: number): AudioBuffer {
    const { numberOfChannels: ch, length, sampleRate } = buffer;
    const out = this.createBuffer(length, ch, sampleRate);
    for (let c = 0; c < ch; c++) {
      const inp = buffer.getChannelData(c);
      const o = out.getChannelData(c);
      for (let i = 0; i < length; i++) o[i] = inp[i] * gain;
    }
    return out;
  }

  /**
   * Adjust volume on a range
   */
  public static adjustVolume(buffer: AudioBuffer, start: number, end: number, gain: number): AudioBuffer {
    const { numberOfChannels: ch, length, sampleRate } = buffer;
    const out = this.createBuffer(length, ch, sampleRate);
    for (let c = 0; c < ch; c++) {
      const inp = buffer.getChannelData(c);
      const o = out.getChannelData(c);
      for (let i = 0; i < length; i++) {
        o[i] = (i >= start && i < end) ? Math.max(-1, Math.min(1, inp[i] * gain)) : inp[i];
      }
    }
    return out;
  }

  // ─── Selection operations ────────────────────────────────────────────

  /**
   * Copy a range from buffer (returns the copied region only)
   */
  public static copy(buffer: AudioBuffer, start: number, end: number): AudioBuffer {
    const rangeLen = end - start;
    if (rangeLen <= 0) return this.createBuffer(1, buffer.numberOfChannels, buffer.sampleRate);
    const out = this.createBuffer(rangeLen, buffer.numberOfChannels, buffer.sampleRate);
    this.copyRegion(buffer, out, start, 0, rangeLen);
    return out;
  }

  /**
   * Cut a range: returns { remaining, cut }
   */
  public static cut(buffer: AudioBuffer, start: number, end: number): { remaining: AudioBuffer; cut: AudioBuffer } {
    const cut = this.copy(buffer, start, end);
    const remaining = this.deleteRange(buffer, start, end);
    return { remaining, cut };
  }

  /**
   * Paste buffer at a position (inserts, does not overwrite)
   */
  public static paste(buffer: AudioBuffer, position: number, pasteBuffer: AudioBuffer): AudioBuffer {
    const newLen = buffer.length + pasteBuffer.length;
    const ch = buffer.numberOfChannels;
    const out = this.createBuffer(newLen, ch, buffer.sampleRate);
    // Before insert point
    if (position > 0) this.copyRegion(buffer, out, 0, 0, position);
    // Pasted data
    for (let c = 0; c < Math.min(ch, pasteBuffer.numberOfChannels); c++) {
      const p = pasteBuffer.getChannelData(c);
      const o = out.getChannelData(c);
      for (let i = 0; i < pasteBuffer.length; i++) o[position + i] = p[i];
    }
    // After insert point
    const afterLen = buffer.length - position;
    if (afterLen > 0) this.copyRegion(buffer, out, position, position + pasteBuffer.length, afterLen);
    return out;
  }

  /**
   * Crop: return only the selected range
   */
  public static crop(buffer: AudioBuffer, start: number, end: number): AudioBuffer {
    return this.copy(buffer, start, end);
  }

  /**
   * Delete a range (remove samples, shorten buffer)
   */
  public static deleteRange(buffer: AudioBuffer, start: number, end: number): AudioBuffer {
    const rangeLen = end - start;
    const newLen = buffer.length - rangeLen;
    if (newLen <= 0) return this.createBuffer(1, buffer.numberOfChannels, buffer.sampleRate);
    const out = this.createBuffer(newLen, buffer.numberOfChannels, buffer.sampleRate);
    if (start > 0) this.copyRegion(buffer, out, 0, 0, start);
    const afterLen = buffer.length - end;
    if (afterLen > 0) this.copyRegion(buffer, out, end, start, afterLen);
    return out;
  }

  /**
   * Silence a range (zero samples, keep length)
   */
  public static silence(buffer: AudioBuffer, start: number, end: number): AudioBuffer {
    const { numberOfChannels: ch, length, sampleRate } = buffer;
    const out = this.createBuffer(length, ch, sampleRate);
    for (let c = 0; c < ch; c++) {
      const inp = buffer.getChannelData(c);
      const o = out.getChannelData(c);
      for (let i = 0; i < length; i++) {
        o[i] = (i >= start && i < end) ? 0 : inp[i];
      }
    }
    return out;
  }

  // ─── Fade operations ─────────────────────────────────────────────────

  /**
   * Fade in over a range
   */
  public static fadeIn(buffer: AudioBuffer, start: number, end: number, curve: 'linear' | 'exponential' = 'linear'): AudioBuffer {
    const { numberOfChannels: ch, length, sampleRate } = buffer;
    const out = this.createBuffer(length, ch, sampleRate);
    const rangeLen = end - start;
    for (let c = 0; c < ch; c++) {
      const inp = buffer.getChannelData(c);
      const o = out.getChannelData(c);
      for (let i = 0; i < length; i++) {
        if (i >= start && i < end) {
          const t = (i - start) / rangeLen;
          const gain = curve === 'exponential' ? t * t : t;
          o[i] = inp[i] * gain;
        } else {
          o[i] = inp[i];
        }
      }
    }
    return out;
  }

  /**
   * Fade out over a range
   */
  public static fadeOut(buffer: AudioBuffer, start: number, end: number, curve: 'linear' | 'exponential' = 'linear'): AudioBuffer {
    const { numberOfChannels: ch, length, sampleRate } = buffer;
    const out = this.createBuffer(length, ch, sampleRate);
    const rangeLen = end - start;
    for (let c = 0; c < ch; c++) {
      const inp = buffer.getChannelData(c);
      const o = out.getChannelData(c);
      for (let i = 0; i < length; i++) {
        if (i >= start && i < end) {
          const t = 1 - (i - start) / rangeLen;
          const gain = curve === 'exponential' ? t * t : t;
          o[i] = inp[i] * gain;
        } else {
          o[i] = inp[i];
        }
      }
    }
    return out;
  }

  // ─── Analysis / helpers ──────────────────────────────────────────────

  /**
   * Remove DC offset from buffer (or a range)
   */
  public static dcOffsetRemoval(buffer: AudioBuffer, start?: number, end?: number): AudioBuffer {
    const s = start ?? 0;
    const e = end ?? buffer.length;
    const { numberOfChannels: ch, length, sampleRate } = buffer;
    const out = this.createBuffer(length, ch, sampleRate);
    for (let c = 0; c < ch; c++) {
      const inp = buffer.getChannelData(c);
      const o = out.getChannelData(c);
      // Calculate mean in range
      let sum = 0;
      for (let i = s; i < e; i++) sum += inp[i];
      const mean = sum / (e - s);
      // Apply
      for (let i = 0; i < length; i++) {
        o[i] = (i >= s && i < e) ? inp[i] - mean : inp[i];
      }
    }
    return out;
  }

  /**
   * Find nearest zero crossing within a search range
   */
  public static findNearestZeroCrossing(buffer: AudioBuffer, sampleIndex: number, searchRange: number = 512): AudioBuffer | number {
    const data = buffer.getChannelData(0);
    const len = data.length;
    let bestDist = searchRange + 1;
    let bestIdx = sampleIndex;
    const lo = Math.max(0, sampleIndex - searchRange);
    const hi = Math.min(len - 1, sampleIndex + searchRange);
    for (let i = lo; i < hi; i++) {
      if ((data[i] >= 0 && data[i + 1] < 0) || (data[i] < 0 && data[i + 1] >= 0)) {
        const dist = Math.abs(i - sampleIndex);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }
    }
    return bestIdx;
  }

  /**
   * Find best loop point via cross-correlation
   */
  public static findBestLoopPoint(buffer: AudioBuffer, minLength: number = 1000, maxLength?: number): { start: number; end: number } {
    const data = buffer.getChannelData(0);
    const len = data.length;
    const maxLen = maxLength ?? Math.floor(len * 0.9);
    const windowSize = 256; // comparison window
    let bestScore = -Infinity;
    let bestStart = 0;
    let bestEnd = len;

    // Try different end positions, compare waveform shape at start vs end of loop
    const step = Math.max(1, Math.floor(len / 500)); // test ~500 positions
    for (let end = Math.min(maxLen, len); end > minLength + windowSize; end -= step) {
      for (let start = 0; start < end - minLength; start += step) {
        // Cross-correlate windowSize samples at loop boundary
        let score = 0;
        const w = Math.min(windowSize, end - start);
        for (let i = 0; i < w; i++) {
          score += data[start + i] * data[(end - w) + i];
        }
        if (score > bestScore) {
          bestScore = score;
          bestStart = start;
          bestEnd = end;
        }
      }
    }
    // Snap to zero crossings
    const snapStart = this.findNearestZeroCrossing(buffer, bestStart, 128);
    const snapEnd = this.findNearestZeroCrossing(buffer, bestEnd, 128);
    return { start: typeof snapStart === 'number' ? snapStart : bestStart, end: typeof snapEnd === 'number' ? snapEnd : bestEnd };
  }

  // ─── WAV export ──────────────────────────────────────────────────────

  /**
   * Convert AudioBuffer to WAV ArrayBuffer (16-bit PCM)
   */
  public static async bufferToWav(buffer: AudioBuffer): Promise<ArrayBuffer> {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    const numFrames = buffer.length;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = numFrames * blockAlign;
    const fileSize = 44 + dataSize;
    const arrayBuffer = new ArrayBuffer(fileSize);
    const view = new DataView(arrayBuffer);

    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, fileSize - 8, true);
    this.writeString(view, 8, 'WAVE');
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < numFrames; i++) {
      for (let channel = 0; channel < numChannels; channel++) {
        let sample = buffer.getChannelData(channel)[i];
        sample = Math.max(-1, Math.min(1, sample));
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, intSample, true);
        offset += 2;
      }
    }
    return arrayBuffer;
  }

  private static writeString(view: DataView, offset: number, string: string): void {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
}

    