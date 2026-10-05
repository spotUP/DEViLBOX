/**
 * One subsong switch for every song that has subsongs: Furnace modules, UADE
 * editable formats, C64 SID, ActivisionPro and the whole-song engines
 * (game-music-emu, ASAP, PSG play). The FT2 toolbar's previous / next
 * buttons, the format selectors and the scope view's control all switch
 * through `switchSubsong`, so a subsong change does the same thing wherever
 * it starts.
 */
import { useFormatStore, type FormatStore } from '@stores/useFormatStore';
import { notify } from '@stores/useNotificationStore';

export type SubsongSource = 'furnace' | 'uade' | 'sid' | 'activisionPro' | 'native';

export interface SubsongStatus {
  source: SubsongSource;
  count: number;
  /** 0-based */
  current: number;
}

type SubsongFields = Pick<FormatStore,
  'furnaceSubsongs' | 'furnaceActiveSubsong' | 'uadeEditableSubsongs' | 'uadeEditableCurrentSubsong'
  | 'sidMetadata' | 'activisionProSubsongCount' | 'activisionProCurrentSubsong' | 'nativeSubsongs'>;

/** The subsongs of the song loaded, from whichever format holds them; null when it has none. */
export function subsongStatus(f: SubsongFields): SubsongStatus | null {
  if (f.furnaceSubsongs && f.furnaceSubsongs.length > 0) {
    return { source: 'furnace', count: f.furnaceSubsongs.length, current: f.furnaceActiveSubsong };
  }
  if (f.uadeEditableSubsongs && f.uadeEditableSubsongs.count > 0) {
    return { source: 'uade', count: f.uadeEditableSubsongs.count, current: f.uadeEditableCurrentSubsong };
  }
  if (f.sidMetadata && f.sidMetadata.subsongs > 0) {
    return { source: 'sid', count: f.sidMetadata.subsongs, current: f.sidMetadata.currentSubsong };
  }
  if (f.activisionProSubsongCount > 0) {
    return { source: 'activisionPro', count: f.activisionProSubsongCount, current: f.activisionProCurrentSubsong };
  }
  if (f.nativeSubsongs) {
    return { source: 'native', count: f.nativeSubsongs.count, current: f.nativeSubsongs.current };
  }
  return null;
}

/** The subsong `delta` away from the one playing, or null past either end. */
export function stepTarget(status: SubsongStatus | null, delta: number): number | null {
  if (!status) return null;
  const target = status.current + delta;
  return target >= 0 && target < status.count ? target : null;
}

/** Switch the song loaded to subsong `index` (0-based). */
export async function switchSubsong(index: number): Promise<void> {
  const fmt = useFormatStore.getState();
  const status = subsongStatus(fmt);
  if (!status || index < 0 || index >= status.count || index === status.current) return;
  switch (status.source) {
    case 'furnace': {
      const sub = fmt.furnaceSubsongs![index];
      const [{ useTrackerStore }, { useTransportStore }, { getTrackerReplayer }] = await Promise.all([
        import('@stores/useTrackerStore'), import('@stores/useTransportStore'), import('@engine/TrackerReplayer'),
      ]);
      const tracker = useTrackerStore.getState();
      const transport = useTransportStore.getState();
      tracker.loadPatterns(sub.patterns);
      tracker.setPatternOrder(sub.songPositions);
      transport.setBPM(sub.initialBPM);
      transport.setSpeed(sub.initialSpeed);
      // Furnace speed alternation: speed2 is subsong-specific.
      getTrackerReplayer().setSpeed2(sub.speed2 !== undefined && sub.speed2 !== sub.initialSpeed ? sub.speed2 : null);
      fmt.setFurnaceActiveSubsong(index);
      notify.success(`Switched to: ${sub.name || `Subsong ${index + 1}`}`);
      return;
    }
    case 'uade': {
      const subs = fmt.uadeEditableSubsongs!;
      const [{ useTrackerStore }, { useTransportStore }] = await Promise.all([
        import('@stores/useTrackerStore'), import('@stores/useTransportStore'),
      ]);
      useFormatStore.setState({ uadeEditableCurrentSubsong: index });
      const tracker = useTrackerStore.getState();
      tracker.setPatternOrder([index]);
      tracker.setCurrentPattern(index);
      useTransportStore.getState().setSpeed(subs.speeds[index] ?? 6);
      // Switch the UADE subsong in place (no full reload: avoids a double init).
      try {
        const { UADEEngine } = await import('@engine/uade/UADEEngine');
        if (UADEEngine.hasInstance()) {
          const engine = UADEEngine.getInstance();
          engine.setSubsong(index);
          engine.play();
        }
      } catch { /* not loaded yet: the next play picks it up */ }
      notify.success(`Subsong ${index + 1}/${subs.count}`);
      return;
    }
    case 'sid': {
      const meta = fmt.sidMetadata!;
      try {
        const { getTrackerReplayer } = await import('@engine/TrackerReplayer');
        const engine = getTrackerReplayer().getC64SIDEngine();
        if (engine) {
          engine.setSubsong(index);
          fmt.setSidMetadata({ ...meta, currentSubsong: index });
          notify.success(`SID Subsong ${index + 1}/${meta.subsongs}`);
        }
      } catch {
        notify.error('Failed to switch SID subsong');
      }
      return;
    }
    case 'activisionPro': {
      fmt.setActivisionProCurrentSubsong(index);
      try {
        const { ActivisionProEngine } = await import('@engine/activisionpro/ActivisionProEngine');
        if (ActivisionProEngine.hasInstance()) {
          const engine = ActivisionProEngine.getInstance();
          engine.setSubsong(index);
          engine.play();
        }
      } catch { /* engine not loaded yet */ }
      notify.success(`Subsong ${index + 1}/${status.count}`);
      return;
    }
    case 'native': {
      const { selectNativeSubsong } = await import('@engine/replayer/nativeSubsongPlayback');
      await selectNativeSubsong(index);
      return;
    }
  }
}

/** Previous (-1) or next (+1) subsong; nothing past either end. */
export async function stepSubsong(delta: -1 | 1): Promise<void> {
  const target = stepTarget(subsongStatus(useFormatStore.getState()), delta);
  if (target !== null) await switchSubsong(target);
}
