// @ts-nocheck - API method type issues
/**
 * PatternScheduler - Schedule pattern playback with Tone.js Transport
 *
 * Implements tick-level scheduling for accurate effect processing:
 * - Row events trigger notes and initialize effects (tick 0)
 * - Tick events process continuous effects (vibrato, portamento, volume slide, etc.)
 * - Standard tracker timing: 2.5ms per tick at 125 BPM
 */

import * as Tone from 'tone';
import { getToneEngine } from './ToneEngine';
import { getEffectProcessor } from './EffectCommands';
import { getAutomationPlayer } from './AutomationPlayer';
import { useTransportStore } from '@stores/useTransportStore';
import { notify } from '@stores/useNotificationStore';
import { xmNoteToToneJS, xmEffectToString } from '@/lib/xmConversions';
import type { Pattern } from '@typedefs';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { AutomationCurve } from '@typedefs/automation';

interface AutomationData {
  [patternId: string]: {
    [channelIndex: number]: {
      [parameter: string]: AutomationCurve;
    };
  };
}

/**
 * Convert tracker note to Tone.js format
 * Supports both old string format ("C-4") and new XM numeric format (49)
 *
 * @param note Note value (string or number)
 * @returns Tone.js note string ("C4", "D#5", etc.) or null
 */
function convertNoteFormat(note: string | number): string | null {
  // New XM numeric format
  if (typeof note === 'number') {
    return xmNoteToToneJS(note);
  }

  // Old string format (backward compatibility)
  if (note === '===' || note === '...' || !note) {
    return null;
  }

  // Remove dash from note format: "C-4" -> "C4", "C#-4" -> "C#4"
  return note.replace('-', '');
}

export class PatternScheduler {
  private currentPart: Tone.Part | null = null;
  private nextPart: Tone.Part | null = null; // Pre-scheduled next pattern
  private pattern: Pattern | null = null;
  private onRowChange: ((row: number) => void) | null = null;
  private onPatternEnd: (() => void) | null = null;
  private onPatternBreak: ((targetRow: number) => void) | null = null;
  private onPositionJump: ((position: number) => void) | null = null;
  private automation: AutomationData = {};
  private channelNotes: Map<number, Set<string>> = new Map(); // Track active notes per channel
  private channelActiveInstruments: Map<number, number> = new Map(); // Track active instrument per channel
  private effectProcessor = getEffectProcessor();

  // Error tracking
  private playbackErrors: Map<string, number> = new Map(); // error message -> count
  private errorNotificationShown: boolean = false;
  private readonly ERROR_THRESHOLD = 5; // Show notification after 5 errors
  private automationPlayer = getAutomationPlayer();
  private patternBreakScheduled: boolean = false; // Prevent double pattern breaks
  private currentPatternEndTime: number = 0; // When current pattern ends (transport seconds)
  private nextPatternScheduled: boolean = false; // Track if next pattern is pre-scheduled
  private tickPart: Tone.Part | null = null; // Separate Part for tick events
  // Deferred pattern control: pattern breaks/jumps execute at END of row, not immediately
  private pendingPatternBreak: { position: number } | null = null;
  private pendingPositionJump: number | null = null;

  /**
   * Track playback errors and notify user if threshold exceeded
   */
  private trackPlaybackError(note: string, error: Error): void {
    const errorKey = error.message.split(':')[0]; // Group similar errors
    const count = (this.playbackErrors.get(errorKey) || 0) + 1;
    this.playbackErrors.set(errorKey, count);

    console.error(`Failed to trigger note ${note}:`, error);

    // Show notification if error threshold exceeded (only once per session)
    const totalErrors = Array.from(this.playbackErrors.values()).reduce((a, b) => a + b, 0);
    if (totalErrors >= this.ERROR_THRESHOLD && !this.errorNotificationShown) {
      this.errorNotificationShown = true;
      const errorList = Array.from(this.playbackErrors.entries())
        .map(([msg, cnt]) => `${msg} (${cnt}×)`)
        .join(', ');
      notify.error(
        `Playback errors detected: ${errorList}. Check console for details or review SONG_FORMAT.md`,
        15000
      );
    }
  }

  /**
   * Reset error tracking (called when stopping playback)
   */
  private resetErrorTracking(): void {
    this.playbackErrors.clear();
    this.errorNotificationShown = false;
  }

  /**
   * Set automation data
   */
  public setAutomation(automation: AutomationData): void {
    this.automation = automation;
    // Debug: log automation data details
    const patternIds = Object.keys(automation);
    if (patternIds.length > 0) {
      patternIds.forEach(pid => {
        const channels = Object.keys(automation[pid] || {});
        channels.forEach(ch => {
          const params = Object.keys(automation[pid][Number(ch)] || {});
          console.log(`[PatternScheduler] Automation set for pattern ${pid}, channel ${ch}:`, params);
        });
      });
    } else {
      console.log('[PatternScheduler] Automation data is empty');
    }
  }

  /**
   * Get automation value for a specific parameter at a specific row
   */
  private getAutomationValue(
    patternId: string,
    channelIndex: number,
    parameter: string,
    row: number
  ): number | null {
    const curve = this.automation[patternId]?.[channelIndex]?.[parameter];
    if (!curve || curve.points.length === 0) return null;

    // Find surrounding points
    const sortedPoints = [...curve.points].sort((a, b) => a.row - b.row);

    // If before first point
    if (row < sortedPoints[0].row) return sortedPoints[0].value;

    // If after last point
    if (row >= sortedPoints[sortedPoints.length - 1].row) {
      return sortedPoints[sortedPoints.length - 1].value;
    }

    // Find points around current row
    let prevPoint = sortedPoints[0];
    let nextPoint = sortedPoints[sortedPoints.length - 1];

    for (let i = 0; i < sortedPoints.length - 1; i++) {
      if (sortedPoints[i].row <= row && sortedPoints[i + 1].row > row) {
        prevPoint = sortedPoints[i];
        nextPoint = sortedPoints[i + 1];
        break;
      }
    }

    // If exactly on a point
    if (prevPoint.row === row) return prevPoint.value;

    // Interpolate
    const rowDiff = nextPoint.row - prevPoint.row;
    const valueDiff = nextPoint.value - prevPoint.value;
    const t = (row - prevPoint.row) / rowDiff;

    if (curve.interpolation === 'linear') {
      return prevPoint.value + valueDiff * t;
    } else if (curve.interpolation === 'exponential') {
      return prevPoint.value + valueDiff * (t * t);
    }

    return prevPoint.value;
  }

  /**
   * Get current speed (ticks per row)
   */
  private getTicksPerRow(): number {
    return this.effectProcessor.getTicksPerRow();
  }

  /**
   * Get seconds per tick based on BPM
   * Classic Amiga/ProTracker formula: tickDuration = 2.5 / BPM
   * At 125 BPM: 2.5 / 125 = 0.02 seconds = 20ms per tick
   * With speed 6: 20ms * 6 = 120ms per row
   */
  private getSecondsPerTick(): number {
    const engine = getToneEngine();
    const bpm = engine.getBPM();
    return 2.5 / bpm;
  }

  /**
   * Get seconds per row based on current BPM and speed
   */
  private getSecondsPerRow(): number {
    return this.getSecondsPerTick() * this.getTicksPerRow();
  }

  /**
   * Pre-scan pattern for Fxx effects and compute accurate row timings
   * ProTracker processes Fxx immediately, affecting all subsequent rows
   * Returns array of { time, speed, bpm } for each row
   */
  private computeRowTimings(pattern: Pattern, initialSpeed: number, initialBPM: number): Array<{ time: number; speed: number; bpm: number }> {
    const timings: Array<{ time: number; speed: number; bpm: number }> = [];
    let currentSpeed = initialSpeed;
    let currentBPM = initialBPM;
    let currentTime = 0;

    for (let row = 0; row < pattern.length; row++) {
      // First, process any Fxx effects on this row (they take effect immediately)
      pattern.channels.forEach((channel) => {
        const cell = channel.rows[row];

        // Check XM numeric effect format
        if (cell.effTyp === 0xF && cell.eff !== undefined) {
          const param = cell.eff;
          if (param > 0 && param < 0x20) {
            currentSpeed = param;
          } else if (param >= 0x20) {
            currentBPM = param;
          }
        }

        // Check string effect format (effect1)
        const effect1 = (cell.effTyp !== undefined && cell.effTyp !== 0)
          ? xmEffectToString(cell.effTyp, cell.eff ?? 0)
          : null;
        if (effect1 && effect1.toUpperCase().startsWith('F')) {
          const param = parseInt(effect1.substring(1), 16);
          if (param > 0 && param < 0x20) {
            currentSpeed = param;
          } else if (param >= 0x20) {
            currentBPM = param;
          }
        }

        // Check effect2
        const effect2 = cell.effect2 && cell.effect2 !== '...' ? cell.effect2 : null;
        if (effect2 && effect2.toUpperCase().startsWith('F')) {
          const param = parseInt(effect2.substring(1), 16);
          if (param > 0 && param < 0x20) {
            currentSpeed = param;
          } else if (param >= 0x20) {
            currentBPM = param;
          }
        }
      });

      // Store timing for this row (using speed/BPM AFTER Fxx processing)
      timings.push({ time: currentTime, speed: currentSpeed, bpm: currentBPM });

      // Calculate duration of this row and advance time
      const secondsPerTick = 2.5 / currentBPM;
      const rowDuration = secondsPerTick * currentSpeed;
      currentTime += rowDuration;
    }

    console.log(`[PatternScheduler] Row timings computed: initial speed=${initialSpeed}, initial BPM=${initialBPM}`);
    console.log(`[PatternScheduler] Final row ${pattern.length - 1} at time ${timings[timings.length - 1]?.time.toFixed(3)}s`);

    return timings;
  }

  /**
   * Calculate swing offset for a given row
   * Swing delays off-beat rows by a percentage of the row duration
   * @param row The row number
   * @param swingAmount Swing amount (0-100, where 50 = no swing, 100 = full triplet feel)
   * @param rowDuration Duration of this row in seconds (for accurate per-row timing)
   * @returns Time offset in seconds
   */
  private getSwingOffset(row: number, swingAmount: number, rowDuration: number): number {
    // No swing at 0 or 50 (neutral)
    if (swingAmount === 0 || swingAmount === 50) return 0;

    // Swing affects every other row (odd rows in 2-row groupings)
    // In standard 4-row beat: rows 1, 3 get swing; rows 0, 2 are on-beat
    const rowsPerSwingGroup = 2;
    const isSwungRow = (row % rowsPerSwingGroup) === 1;

    if (!isSwungRow) return 0;

    // Calculate swing ratio (50 = no swing, 100 = full delay, 0 = early)
    // swing > 50: delay the off-beat
    // swing < 50: play off-beat earlier (less common but supported)

    // Max swing is half a row's duration (creates triplet feel at 100)
    const maxSwingOffset = rowDuration * 0.5;

    // Normalize swing from 0-100 to -1 to 1 (50 = 0)
    const normalizedSwing = (swingAmount - 50) / 50;

    return normalizedSwing * maxSwingOffset;
  }

  /**
   * Apply tick effect results to a channel
   * Note: Some effects (frequency changes) require synth-level support
   * that may not be fully implemented in ToneEngine yet.
   * @param channelIndex The channel to apply effects to
   * @param tickResult The result from the effect processor
   */
  private applyTickEffects(
    channelIndex: number,
    tickResult: ReturnType<typeof this.effectProcessor.processTick>
  ): void {
    const engine = getToneEngine();
    const instrumentId = this.channelActiveInstruments.get(channelIndex);

    if (instrumentId === undefined) return;

    // Apply frequency changes for ProTracker effects (arpeggio, portamento, vibrato)
    if (tickResult.frequencySet !== undefined) {
      // Direct frequency set (arpeggio, tone portamento)
      engine.setChannelFrequency(channelIndex, tickResult.frequencySet);
    } else if (tickResult.frequencyMult !== undefined) {
      // Frequency multiplier (vibrato, pitch bend)
      engine.setChannelPitch(channelIndex, tickResult.frequencyMult);
    }

    // Apply volume changes (for volume slide, tremolo, tremor)
    // Convert 0-64 tracker volume to dB for ToneEngine
    if (tickResult.volumeSet !== undefined) {
      const volumeDb = tickResult.volumeSet === 0 ? -Infinity : -24 + (tickResult.volumeSet / 64) * 24;
      console.log(`[PatternScheduler] Tick volume change ch${channelIndex}: ${tickResult.volumeSet}/64 -> ${volumeDb.toFixed(1)}dB`);
      engine.setChannelVolume(channelIndex, volumeDb);
    }

    if (tickResult.volumeAdd !== undefined) {
      const currentVol = this.effectProcessor.getCurrentVolume(channelIndex);
      const newVol = Math.max(0, Math.min(64, currentVol + tickResult.volumeAdd));
      const volumeDb = newVol === 0 ? -Infinity : -24 + (newVol / 64) * 24;
      engine.setChannelVolume(channelIndex, volumeDb);
    }

    // Apply panning changes
    if (tickResult.panSet !== undefined) {
      // Convert 0-255 to -100 to 100 for ToneEngine
      const pan = ((tickResult.panSet - 128) / 128) * 100;
      engine.setChannelPan(channelIndex, pan);
    }

    // Handle note cut
    if (tickResult.cutNote) {
      engine.setChannelVolume(channelIndex, -Infinity);
    }

    // Handle note retrigger
    // This would need additional ToneEngine support to retrigger active notes
    if (tickResult.triggerNote) {
      // Retrigger not fully implemented - would need synth-level support
      // to retrigger without releasing the previous note
    }
  }

  /**
   * Schedule a pattern for playback
   * @param startOffset - Transport time offset to start the pattern (default 0)
   */
  public schedulePattern(
    pattern: Pattern,
    instruments: InstrumentConfig[],
    onRowChange?: (row: number) => void,
    startOffset: number = 0
  ): void {
    // Only clear if starting fresh (offset 0)
    if (startOffset === 0) {
      this.clearSchedule();
    }
    this.pattern = pattern;
    this.onRowChange = onRowChange || null;
    this.nextPatternScheduled = false;

    console.log('[PatternScheduler] Scheduling pattern:', pattern.name, 'at offset', startOffset, 'with', instruments.length, 'instruments');
    console.log('[PatternScheduler] Pattern ID:', pattern.id, 'Row 0 data:', pattern.channels[0]?.rows[0]);
    instruments.forEach(inst => console.log(`  - Instrument ${inst.id}: ${inst.name} (${inst.synthType})`));

    const engine = getToneEngine();

    // Apply initial BPM/speed from MOD/XM metadata (only on first pattern)
    if (startOffset === 0 && pattern.importMetadata?.modData) {
      const modData = pattern.importMetadata.modData;

      console.log(`[PatternScheduler] Applying MOD/XM metadata: speed=${modData.initialSpeed}, BPM=${modData.initialBPM}`);

      // Set initial speed (ticks per row)
      if (modData.initialSpeed) {
        this.effectProcessor.ticksPerRow = modData.initialSpeed;
      }

      // Set initial BPM
      if (modData.initialBPM) {
        engine.setBPM(modData.initialBPM);
      }
    }

    // Set pattern in automation player
    this.automationPlayer.setPattern(pattern);
    this.automationPlayer.setAutomationData(this.automation);
    const events: Array<{ time: number; audioCallback: (time: number) => void; uiCallback: () => void }> = [];

    // Pre-compute row timings accounting for Fxx speed/BPM changes
    const initialSpeed = this.effectProcessor.getTicksPerRow();
    const initialBPM = engine.getBPM();
    const rowTimings = this.computeRowTimings(pattern, initialSpeed, initialBPM);

    // Schedule each row - use seconds directly (Tone.js accepts numbers as seconds)
    // Rows per beat for metronome (4 rows = 1 beat in standard tracker timing)
    const rowsPerBeat = 4;

    // Get swing amount from transport store
    const swingAmount = useTransportStore.getState().swing;

    for (let row = 0; row < pattern.length; row++) {
      // Calculate this row's duration for accurate swing timing
      const rowDuration = (2.5 / rowTimings[row].bpm) * rowTimings[row].speed;
      // Apply swing offset to off-beat rows
      const swingOffset = this.getSwingOffset(row, swingAmount, rowDuration);
      // Use pre-computed timing that accounts for Fxx speed changes
      const time = startOffset + rowTimings[row].time + swingOffset;

      events.push({
        time,
        // Audio callback receives precise Transport time for sample-accurate scheduling
        audioCallback: (transportTime: number) => {
          // Trigger metronome click on beat boundaries
          if (row % rowsPerBeat === 0 && engine.isMetronomeEnabled()) {
            const isDownbeat = row === 0; // First row of pattern is downbeat
            engine.triggerMetronomeClick(transportTime, isDownbeat);
          }
          // Process automation for all channels at this row
          this.automationPlayer.processPatternRow(row);

          // TEMPO PRE-SCAN: Process all Fxx effects BEFORE any other effects
          // This matches BassoonTracker's implementation and ensures tempo changes
          // affect all channels in the same row consistently
          pattern.channels.forEach((channel, _channelIndex) => {
            const cell = channel.rows[row];
            // Convert XM numeric effects to string format for tempo pre-scan
            const effect1 = (cell.effTyp !== undefined && cell.effTyp !== 0)
              ? xmEffectToString(cell.effTyp, cell.eff ?? 0)
              : null;
            const effect2 = cell.effect2 && cell.effect2 !== '...' ? cell.effect2 : null;
            const effects = [effect1, effect2].filter(e => e && e !== '...');

            for (const effect of effects) {
              if (effect && effect.toUpperCase().startsWith('F')) {
                const param = parseInt(effect.substring(1), 16);
                if (param === 0) {
                  console.log('[PatternScheduler] F00: Stop song (not implemented)');
                } else if (param < 0x20) {
                  console.log(`[PatternScheduler] Tempo pre-scan: F${effect.substring(1)}: Setting speed to ${param} ticks/row`);
                  this.effectProcessor.ticksPerRow = param;
                } else {
                  console.log(`[PatternScheduler] Tempo pre-scan: F${effect.substring(1)}: Setting BPM to ${param}`);
                  engine.setBPM(param);
                }
              }
            }
          });

          // First pass: Process notes and effects for all channels
          pattern.channels.forEach((channel, channelIndex) => {
            const cell = channel.rows[row];
            // XM-compatible instrument resolution (0 = no instrument, 1-128 = valid)
            const cellInstrument = cell.instrument ?? 0;
            const instrumentId = cellInstrument !== 0 ? cellInstrument : (channel.instrumentId ?? 0);

            // Convert XM numeric effects to string format for processing
            // cell.effTyp + cell.eff (XM format) → "C40" (string format)
            const effect1 = (cell.effTyp !== undefined && cell.effTyp !== 0)
              ? xmEffectToString(cell.effTyp, cell.eff ?? 0)
              : null;
            const effect2 = cell.effect2 && cell.effect2 !== '...' ? cell.effect2 : null;

            // Decode XM volume column to 0-64 range or null (ONCE per row, not per effect)
            // XM volume: 0x10-0x50 = set volume 0-64, others are volume effects or nothing
            let decodedVolume: number | null = null;
            if (cell.volume >= 0x10 && cell.volume <= 0x50) {
              decodedVolume = cell.volume - 0x10; // Extract volume (0-64)
            }

            // CRITICAL: Process effects BEFORE checking for notes
            // Effects like Axy (volume slide) must be processed even on rows with no notes
            const effects = [effect1, effect2].filter(e => e && e !== '...');
            const primaryEffect = effects.find(e => !e.toUpperCase().startsWith('F')) || null;

            // Always call effect processor to set up tick-based effects (volume slide, etc.)
            const effectResult = this.effectProcessor.processRowStart(
              channelIndex,
              cell.note,
              primaryEffect,
              decodedVolume
            );

            // Handle effect results that apply regardless of note presence
            if (effectResult.setVolume !== undefined) {
              // ProTracker behavior: Cxx sets CHANNEL volume, not note velocity
              const volumeDb = effectResult.setVolume === 0 ? -Infinity : -24 + (effectResult.setVolume / 64) * 24;
              console.log(`[PatternScheduler] Row ${row} Ch ${channelIndex}: Effect ${primaryEffect} set channel volume to ${effectResult.setVolume}/64 (${volumeDb.toFixed(1)}dB)`);
              engine.setChannelVolume(channelIndex, volumeDb);
            }

            // Debug: Log all effect processing
            if (primaryEffect) {
              console.log(`[PatternScheduler] Row ${row} Ch ${channelIndex}: Processing effect ${primaryEffect}`);
            }

            // Dxx - Pattern break: DEFER execution to end of row
            if (effectResult.patternBreak && !this.pendingPatternBreak) {
              console.log(`[PatternScheduler] Effect Dxx: Deferring pattern break to row ${effectResult.patternBreak.position} until end of row`);
              this.pendingPatternBreak = effectResult.patternBreak;
            }

            // Bxx - Position jump: DEFER execution to end of row
            if (effectResult.jumpToPosition !== undefined && this.pendingPositionJump === null) {
              console.log(`[PatternScheduler] Effect Bxx: Deferring position jump to ${effectResult.jumpToPosition} until end of row`);
              this.pendingPositionJump = effectResult.jumpToPosition;
            }

            // Fxx - Set speed (ticks per row) or BPM
            if (effectResult.setSpeed !== undefined) {
              console.log(`[PatternScheduler] Row ${row}: Fxx setting speed to ${effectResult.setSpeed} ticks/row`);
              this.effectProcessor.ticksPerRow = effectResult.setSpeed;
            }
            if (effectResult.setBPM !== undefined) {
              console.log(`[PatternScheduler] Row ${row}: Fxx setting BPM to ${effectResult.setBPM}`);
              engine.setBPM(effectResult.setBPM);
            }

            // Debug: Log effects being processed
            if (effect1 || cell.volume !== 0) {
              console.log(`[PatternScheduler] Row ${row}, Ch ${channelIndex}: note=${cell.note}, effect1=${effect1}, decodedVol=${decodedVolume}`);
            }

            // Handle note off (note 97 in XM format)
            if (cell.note === 97) {
              // Release all notes on this channel at precise time
              const activeNotes = this.channelNotes.get(channelIndex);
              if (activeNotes && instrumentId !== 0) {
                activeNotes.forEach((activeNote) => {
                  engine.releaseNote(instrumentId, activeNote, transportTime, channelIndex);
                });
                activeNotes.clear();
              }
              return;
            }

            // Skip note triggering for empty cells (note 0 = no note in XM format)
            // But effects have already been processed above
            if (cell.note === 0) return;

            // Check if instrument exists (0 = no instrument in XM format)
            if (instrumentId === 0) return;

            const instrument = instruments.find((i) => i.id === instrumentId);
            if (!instrument) return;

            // Calculate velocity from volume column
            let velocity = 0.8; // Default velocity
            if (cell.volume !== 0 && cell.volume !== null) {
              // XM volume column: 0x10-0x50 = set volume 0-64
              if (cell.volume >= 0x10 && cell.volume <= 0x50) {
                const vol = cell.volume - 0x10; // Extract volume (0-64)
                velocity = vol / 64; // Normalize to 0-1
              }
              // For backward compatibility with old format (direct 0-64 values)
              else if (cell.volume <= 64) {
                velocity = cell.volume / 64;
              }
              // Other volume column effects (0x60-0xFF) don't set initial velocity
            }

            // ProTracker-accurate duration handling:
            // - MOD samples: Play/loop indefinitely (no duration limit)
            // - Synths: Calculate duration to next note for envelope release
            // Use per-row timing to account for Fxx speed changes
            const currentRowTiming = rowTimings[row];
            const thisRowDuration = (2.5 / currentRowTiming.bpm) * currentRowTiming.speed;
            let duration = thisRowDuration;

            if (instrument.synthType === 'Sampler') {
              // MOD/Sampler: Use very long duration (samples loop naturally)
              // ProTracker behavior: samples play until new note triggers
              duration = 999; // Effectively infinite (16+ minutes)
            } else {
              // Synths: Calculate actual duration for envelope using accumulated timings
              for (let nextRow = row + 1; nextRow < pattern.length; nextRow++) {
                const nextCell = pattern.channels[channelIndex].rows[nextRow];
                const hasNote = typeof nextCell.note === 'number'
                  ? nextCell.note !== 0
                  : (nextCell.note && nextCell.note !== '...');

                if (hasNote) {
                  // Use pre-computed timings for accurate duration across speed changes
                  duration = rowTimings[nextRow].time - rowTimings[row].time;
                  break;
                }
              }
              // Ensure minimum duration to prevent clipping
              duration = Math.max(duration, 0.05);
            }

            // Convert note to Tone.js format (handles both string and XM numeric format)
            const toneNote = convertNoteFormat(cell.note);
            if (!toneNote) return; // Invalid note

            // Track active notes for this channel
            if (!this.channelNotes.has(channelIndex)) {
              this.channelNotes.set(channelIndex, new Set());
            }
            this.channelNotes.get(channelIndex)!.add(toneNote);

            // Check if this is a tone portamento effect (3xx)
            // For TB-303, we should slide to the note instead of skipping it
            let useSlide = cell.slide || false;
            const effectCmd = effect1 && effect1 !== '...' ? parseInt(effect1[0], 16) : -1;
            const effectCmd2 = effect2 && effect2 !== '...' ? parseInt(effect2[0], 16) : -1;
            if (effectCmd === 0x3 || effectCmd2 === 0x3) {
              // Tone portamento - use slide instead of preventing trigger
              useSlide = true;
            }

            // Process effect commands that affect note triggering
            let preventNoteTrigger = false;
            let sampleOffset: number | undefined = undefined; // Track 9xx sample offset

            // 9xx - Sample offset (from effectResult computed above)
            if (effectResult.sampleOffset !== undefined) {
              sampleOffset = effectResult.sampleOffset;
            }

            if (primaryEffect) {
              const effectCmdNum = parseInt(primaryEffect[0], 16);
              if (effectResult.preventNoteTrigger && effectCmdNum !== 0x3) {
                // Effect prevents note trigger (but not 3xx - handled via slide)
                preventNoteTrigger = true;
              }
            }

            // If any effect prevents note trigger, return early
            if (preventNoteTrigger) {
              return;
            }

            // Check if channel is muted/solo'd
            if (engine.isChannelMuted(channelIndex)) {
              return;
            }

            // Track active instrument for this channel (for tick effects)
            this.channelActiveInstruments.set(channelIndex, instrumentId);

            // Trigger note at precise Transport time
            try {
              engine.triggerNote(
                instrumentId,
                toneNote,
                duration,
                transportTime, // Use precise Transport time
                velocity,
                instrument,
                cell.accent || false,
                useSlide, // Use slide flag (includes 3xx tone portamento)
                channelIndex, // Per-channel instrument instance
                cell.period, // Pass period for MOD/XM period-based playback
                sampleOffset // Pass 9xx sample offset if present
              );

              // Trigger VU meter for this channel (real-time visual feedback)
              engine.triggerChannelMeter(channelIndex, velocity);

              // Initialize pitch state for ProTracker effects (arpeggio, portamento, vibrato)
              // Calculate base frequency from the triggered note
              const baseFrequency = Tone.Frequency(toneNote).toFrequency();
              // Determine instrument key (shared for samplers, per-channel for synths)
              const isSharedType = instrument.synthType === 'Sampler' || instrument.synthType === 'Player';
              const instrumentKey = isSharedType
                ? `${instrumentId}--1`
                : `${instrumentId}-${channelIndex}`;
              // For MOD samples, calculate base playback rate from period
              let basePlaybackRate = 1;
              if (cell.period && instrument.metadata?.modPlayback?.usePeriodPlayback) {
                const modPlayback = instrument.metadata.modPlayback;
                const frequency = modPlayback.periodMultiplier / cell.period;
                basePlaybackRate = frequency / Tone.getContext().sampleRate;
              }
              engine.initChannelPitch(channelIndex, instrumentKey, baseFrequency, basePlaybackRate);

              // Remove note from active set after duration
              setTimeout(() => {
                this.channelNotes.get(channelIndex)?.delete(toneNote);
              }, duration * 1000);
            } catch (error) {
              this.trackPlaybackError(toneNote, error as Error);
            }
          });

          // NOTE: Automation is handled by AutomationPlayer.processPatternRow() above
          // which uses the correct value mappings for all parameters.
          // Do NOT add duplicate automation handling here - ToneEngine uses different
          // formulas that don't match the UI control ranges.

          // DEFERRED PATTERN CONTROL: Execute pattern breaks/jumps at END of row
          // This matches BassoonTracker timing - Bxx/Dxx happen after all notes/effects
          if (this.pendingPositionJump !== null) {
            console.log(`[PatternScheduler] Executing deferred position jump to ${this.pendingPositionJump}`);
            if (this.onPositionJump) {
              this.onPositionJump(this.pendingPositionJump);
            }
            this.pendingPositionJump = null;
          }

          if (this.pendingPatternBreak && !this.patternBreakScheduled) {
            console.log(`[PatternScheduler] Executing deferred pattern break to row ${this.pendingPatternBreak.position}`);
            this.patternBreakScheduled = true;
            if (this.onPatternBreak) {
              this.onPatternBreak(this.pendingPatternBreak.position);
            } else if (this.onPatternEnd) {
              this.onPatternEnd();
            }
            this.pendingPatternBreak = null;
          }
        },
        // UI callback for visual updates (row highlighting)
        uiCallback: () => {
          if (this.onRowChange) {
            this.onRowChange(row);
          }
        },
      });
    }

    // Schedule tick events for effect processing (ticks 1 to ticksPerRow-1)
    // Tick 0 is handled by the row events above
    // Use per-row speed/BPM from pre-computed timings
    const tickEvents: Array<{ time: number; callback: (time: number) => void }> = [];
    console.log(`[PatternScheduler] Scheduling with variable speed/BPM per row`);

    for (let row = 0; row < pattern.length; row++) {
      // Get per-row timing values
      const rowTiming = rowTimings[row];
      const rowSpeed = rowTiming.speed;
      const rowSecondsPerTick = 2.5 / rowTiming.bpm;
      const rowDuration = rowSecondsPerTick * rowSpeed;

      // Apply swing offset to tick events too
      const swingOffset = this.getSwingOffset(row, swingAmount, rowDuration);
      const rowStartTime = startOffset + rowTiming.time + swingOffset;

      // Schedule ticks 1 through ticksPerRow-1 (using this row's speed)
      for (let tick = 1; tick < rowSpeed; tick++) {
        const tickTime = rowStartTime + tick * rowSecondsPerTick;

        tickEvents.push({
          time: tickTime,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          callback: (_transportTime: number) => {
            // Process tick effects for all channels at precise transport time
            pattern.channels.forEach((_, channelIndex) => {
              const tickResult = this.effectProcessor.processTick(
                channelIndex,
                tick
              );
              // Debug: Log when tick effects are processed (only if there's a result)
              if (tickResult.volumeSet !== undefined || tickResult.frequencySet !== undefined) {
                console.log(`[PatternScheduler] Tick ${tick} ch${channelIndex}: volumeSet=${tickResult.volumeSet}, freqSet=${tickResult.frequencySet?.toFixed(2)}`);
              }
              this.applyTickEffects(channelIndex, tickResult);
            });
          },
        });
      }
    }

    // Calculate pattern duration from the last row timing plus its duration
    const lastRow = pattern.length - 1;
    const lastRowTiming = rowTimings[lastRow];
    const lastRowDuration = (2.5 / lastRowTiming.bpm) * lastRowTiming.speed;
    const patternDuration = lastRowTiming.time + lastRowDuration;
    const absolutePatternEnd = startOffset + patternDuration;
    this.currentPatternEndTime = absolutePatternEnd;

    console.log(`[PatternScheduler] Pattern duration: ${patternDuration}s, ends at: ${absolutePatternEnd}s, onPatternEnd set: ${!!this.onPatternEnd}`);

    // Capture callback reference to avoid issues with 'this' changing
    const patternEndCallback = this.onPatternEnd;
    if (patternEndCallback && !this.nextPatternScheduled) {
      // Fire callback at the EXACT last row to prevent premature pattern switching
      // Use the pre-computed last row start time
      const callbackTime = startOffset + lastRowTiming.time; // Fire at the start of the last row
      console.log(`[PatternScheduler] Scheduling pattern end callback at ${callbackTime}s (last row start)`);
      events.push({
        time: callbackTime,
        audioCallback: () => {
          if (!this.nextPatternScheduled) {
            console.log(`[PatternScheduler] Pattern end callback fired! Next pattern should start at ${absolutePatternEnd}s`);
            this.nextPatternScheduled = true;
            patternEndCallback();
          }
        },
        uiCallback: () => {}, // No UI update needed
      });
    }

    // Disable Transport looping - we'll handle pattern advancement manually
    const transport = Tone.getTransport();
    transport.loop = false;

    // Determine if we need to reset transport or append to running transport
    const isTransitioningPattern = startOffset > 0;

    if (!isTransitioningPattern) {
      // Fresh start - reset transport to 0
      if (transport.state === 'started') {
        transport.stop();
      }
      transport.position = 0;
    }
    // If transitioning, don't stop transport - just add new Part

    // Clean up old Part if starting fresh
    if (!isTransitioningPattern && this.currentPart) {
      this.currentPart.stop();
      this.currentPart.dispose();
      this.currentPart = null;
    }

    // Create Tone.Part for row events - audio triggers at precise time, UI updates via Draw
    const newPart = new Tone.Part((time, event) => {
      // Trigger audio at exact Transport time
      event.audioCallback(time);
      // Schedule UI update separately to not block audio
      Tone.Draw.schedule(() => {
        event.uiCallback();
      }, time);
    }, events.map(e => [e.time, { audioCallback: e.audioCallback, uiCallback: e.uiCallback }]));

    // Part doesn't loop
    newPart.loop = false;
    newPart.start(0);

    // Create Tone.Part for tick events (effect processing)
    const newTickPart = new Tone.Part((time, event) => {
      event.callback(time);
    }, tickEvents.map(e => [e.time, { callback: e.callback }]));

    newTickPart.loop = false;
    newTickPart.start(0);

    // Track the Parts
    if (isTransitioningPattern) {
      // Keep old Part reference for cleanup, store new one as next
      if (this.nextPart) {
        this.nextPart.dispose();
      }
      this.nextPart = newPart;
      // Dispose old tick part if exists
      if (this.tickPart) {
        this.tickPart.dispose();
      }
      this.tickPart = newTickPart;
    } else {
      this.currentPart = newPart;
      if (this.tickPart) {
        this.tickPart.dispose();
      }
      this.tickPart = newTickPart;
    }

    // Start transport if not running
    if (transport.state !== 'started') {
      transport.start();
    }

    console.log(`Scheduled ${events.length} rows for pattern ${pattern.name}`);
  }

  /**
   * Get the transport time when the current pattern ends
   */
  public getPatternEndTime(): number {
    return this.currentPatternEndTime;
  }

  /**
   * Clear current schedule
   */
  public clearSchedule(): void {
    // CRITICAL: Release all active notes to prevent hanging notes
    try {
      const engine = getToneEngine();
      engine.releaseAll();
    } catch (e) {
      console.warn('[PatternScheduler] Could not release notes:', e);
    }

    if (this.currentPart) {
      this.currentPart.stop();
      this.currentPart.dispose();
      this.currentPart = null;
    }
    if (this.nextPart) {
      this.nextPart.stop();
      this.nextPart.dispose();
      this.nextPart = null;
    }
    if (this.tickPart) {
      this.tickPart.stop();
      this.tickPart.dispose();
      this.tickPart = null;
    }

    // Disable Transport loop
    const transport = Tone.getTransport();
    transport.loop = false;

    // Reset error tracking when stopping
    this.resetErrorTracking();

    // Clear effect processor
    this.effectProcessor.clearAll();

    // Clear channel notes tracking
    this.channelNotes.clear();
    this.channelActiveInstruments.clear();

    // Reset flags
    this.patternBreakScheduled = false;
    this.nextPatternScheduled = false;
    this.currentPatternEndTime = 0;
    this.pendingPatternBreak = null;
    this.pendingPositionJump = null;
  }

  /**
   * Update row change callback
   */
  public setOnRowChange(callback: (row: number) => void): void {
    this.onRowChange = callback;
  }

  /**
   * Set callback for when pattern ends (for advancing to next pattern)
   */
  public setOnPatternEnd(callback: (() => void) | null): void {
    this.onPatternEnd = callback;
  }

  /**
   * Set callback for pattern break (Dxx command)
   */
  public setOnPatternBreak(callback: ((targetRow: number) => void) | null): void {
    this.onPatternBreak = callback;
  }

  /**
   * Set callback for position jump (Bxx command)
   */
  public setOnPositionJump(callback: ((position: number) => void) | null): void {
    this.onPositionJump = callback;
  }

  /**
   * Dispose scheduler
   */
  public dispose(): void {
    this.clearSchedule();
    this.pattern = null;
    this.onRowChange = null;
  }
}

// Singleton instance
let schedulerInstance: PatternScheduler | null = null;

export const getPatternScheduler = (): PatternScheduler => {
  if (!schedulerInstance) {
    schedulerInstance = new PatternScheduler();
  }
  return schedulerInstance;
};
