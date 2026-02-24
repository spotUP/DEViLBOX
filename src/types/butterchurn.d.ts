declare module 'butterchurn' {
  interface VisualizerOptions {
    width: number;
    height: number;
    meshWidth?: number;
    meshHeight?: number;
    pixelRatio?: number;
  }

  interface Visualizer {
    connectAudio(audioNode: AudioNode): void;
    disconnectAudio(audioNode: AudioNode): void;
    loadPreset(preset: object, blendTime?: number): void;
    setRendererSize(width: number, height: number): void;
    render(): void;
    launchSongTitleAnim(title: string): void;
  }

  const butterchurn: {
    createVisualizer(
      audioContext: AudioContext,
      canvas: HTMLCanvasElement,
      options?: VisualizerOptions
    ): Visualizer;
  };

  export default butterchurn;
}

declare module 'butterchurn-presets' {
  interface PresetPack {
    getPresets(): Record<string, object>;
  }
  const presets: PresetPack;
  export default presets;
}

declare module 'butterchurn-presets/lib/butterchurnPresetsExtra.min.js' {
  interface PresetPack { getPresets(): Record<string, object>; }
  const presets: PresetPack;
  export default presets;
}

declare module 'butterchurn-presets/lib/butterchurnPresetsExtra2.min.js' {
  interface PresetPack { getPresets(): Record<string, object>; }
  const presets: PresetPack;
  export default presets;
}

declare module 'butterchurn-presets/lib/butterchurnPresetsMD1.min.js' {
  interface PresetPack { getPresets(): Record<string, object>; }
  const presets: PresetPack;
  export default presets;
}

declare module 'butterchurn-presets/lib/butterchurnPresetsNonMinimal.min.js' {
  interface PresetPack { getPresets(): Record<string, object>; }
  const presets: PresetPack;
  export default presets;
}
