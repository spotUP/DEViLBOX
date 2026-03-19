/**
 * PixiAmigaSynthPanel — Generic GL-native editor for Amiga synth instruments.
 *
 * Renders waveform displays, bar charts (ADSR/LFO/EG tables), knob rows,
 * arpeggio grids, and sequence displays from a declarative layout descriptor.
 * Used by PixiEditInstrumentModal for all Amiga synth formats.
 */

import { useCallback, useRef, useEffect } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PixiKnob, PixiLabel, PixiSelect, type SelectOption } from '../../components';
import { usePixiTheme } from '../../theme';
import type { InstrumentConfig } from '@typedefs/instrument';

// ── Layout descriptor types ─────────────────────────────────────────────────

interface KnobDef {
  key: string;
  label: string;
  min: number;
  max: number;
}

interface WaveformDef {
  type: 'waveform';
  key: string;        // dot-path into config, e.g. 'waveform1'
  label: string;
  maxLen?: number;     // max data length to display (default: data.length)
  color?: number;      // override theme accent
}

interface BarChartDef {
  type: 'barChart';
  key: string;
  label: string;
  signed?: boolean;
}

interface KnobRowDef {
  type: 'knobs';
  label?: string;
  knobs: KnobDef[];
}

interface SelectDef {
  type: 'select';
  key: string;
  label: string;
  options: { value: number; name: string }[];
}

interface SequenceDef {
  type: 'sequence';
  key: string;
  label: string;
  length: number;      // max displayable entries
  min: number;
  max: number;
  signed?: boolean;
}

interface ArpeggiosDef {
  type: 'arpeggios';
  key: string;         // e.g. 'arpeggios' — expects array of { length, repeat, values }
}

interface LabelDef {
  type: 'label';
  text: string;
}

export type AmigaSynthSection =
  | WaveformDef
  | BarChartDef
  | KnobRowDef
  | SelectDef
  | SequenceDef
  | ArpeggiosDef
  | LabelDef;

export interface AmigaSynthLayout {
  formatName: string;
  configKey: string;     // key on InstrumentConfig (e.g. 'sonicArranger', 'inStereo2')
  sections: AmigaSynthSection[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Deep-get a value from an object using dot-notation path */
function deepGet(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current = obj;
  for (const p of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[p];
  }
  return current;
}

/** Deep-set a value in an object using dot-notation path, returning a new object */
function deepSet(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const parts = path.split('.');
  if (parts.length === 1) return { ...obj, [parts[0]]: value };
  const [head, ...rest] = parts;
  const child = (obj[head] ?? {}) as Record<string, unknown>;
  return { ...obj, [head]: deepSet(child, rest.join('.'), value) };
}

// ── Drawing constants ────────────────────────────────────────────────────────

const CHART_W = 300;
const CHART_H = 56;
const WAVE_H = 72;

// ── Component ────────────────────────────────────────────────────────────────

interface PixiAmigaSynthPanelProps {
  layout: AmigaSynthLayout;
  instrument: InstrumentConfig;
  onUpdate: (id: number, changes: Partial<InstrumentConfig>) => void;
}

export const PixiAmigaSynthPanel: React.FC<PixiAmigaSynthPanelProps> = ({
  layout,
  instrument,
  onUpdate,
}) => {
  const theme = usePixiTheme();
  const config = (instrument as unknown as Record<string, unknown>)[layout.configKey] as Record<string, unknown> | undefined;
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; });

  const updateParam = useCallback((key: string, value: unknown) => {
    const current = configRef.current ?? {};
    const updated = deepSet({ ...current }, key, value);
    onUpdate(instrument.id, { [layout.configKey]: updated } as Partial<InstrumentConfig>);
  }, [instrument.id, layout.configKey, onUpdate]);

  const accentColor = theme.accent?.color ?? theme.success.color;

  if (!config) {
    return (
      <layoutContainer layout={{ flexDirection: 'column', gap: 6 }}>
        <PixiLabel text={layout.formatName} size="sm" weight="bold" color="accent" />
        <PixiLabel text="No synth config data available" size="xs" color="textMuted" />
      </layoutContainer>
    );
  }

  return (
    <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
      {layout.sections.map((section, idx) => (
        <AmigaSynthSectionRenderer
          key={idx}
          section={section}
          config={config}
          updateParam={updateParam}
          theme={theme}
          accentColor={accentColor}
        />
      ))}
    </layoutContainer>
  );
};

// ── Section Renderer ─────────────────────────────────────────────────────────

const AmigaSynthSectionRenderer: React.FC<{
  section: AmigaSynthSection;
  config: Record<string, unknown>;
  updateParam: (key: string, value: unknown) => void;
  theme: ReturnType<typeof usePixiTheme>;
  accentColor: number;
}> = ({ section, config, updateParam, theme, accentColor }) => {
  switch (section.type) {
    case 'label':
      return <SectionHead text={section.text} />;

    case 'knobs':
      return (
        <layoutContainer layout={{ flexDirection: 'column', gap: 4 }}>
          {section.label && <SectionHead text={section.label} />}
          <layoutContainer layout={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
            {section.knobs.map((k) => (
              <PixiKnob
                key={k.key}
                value={Number(deepGet(config, k.key) ?? k.min)}
                min={k.min}
                max={k.max}
                onChange={(v) => updateParam(k.key, Math.round(v))}
                label={k.label}
                size="sm"
              />
            ))}
          </layoutContainer>
        </layoutContainer>
      );

    case 'waveform':
      return (
        <WaveformSection
          section={section}
          config={config}
          theme={theme}
          accentColor={section.color ?? accentColor}
        />
      );

    case 'barChart':
      return (
        <BarChartSection
          section={section}
          config={config}
          theme={theme}
          accentColor={accentColor}
        />
      );

    case 'select': {
      const opts: SelectOption[] = section.options.map(o => ({
        value: String(o.value),
        label: `${o.value}: ${o.name}`,
      }));
      return (
        <layoutContainer layout={{ flexDirection: 'column', gap: 4 }}>
          <SectionHead text={section.label} />
          <PixiSelect
            options={opts}
            value={String(deepGet(config, section.key) ?? 0)}
            onChange={(v) => updateParam(section.key, parseInt(v))}
            width={200}
          />
        </layoutContainer>
      );
    }

    case 'sequence': {
      const data = (deepGet(config, section.key) as number[] | undefined) ?? [];
      return (
        <SequenceSection
          section={section}
          data={data}
          theme={theme}
          accentColor={accentColor}
        />
      );
    }

    case 'arpeggios': {
      const arps = (deepGet(config, section.key) as { length: number; repeat: number; values: number[] }[] | undefined) ?? [];
      return (
        <ArpeggioSection
          arps={arps}
          theme={theme}
          accentColor={accentColor}
        />
      );
    }
  }
};

// ── Sub-components ───────────────────────────────────────────────────────────

const SectionHead: React.FC<{ text: string }> = ({ text }) => (
  <layoutContainer layout={{ paddingTop: 2, paddingBottom: 2 }}>
    <PixiLabel text={text} size="xs" weight="bold" color="textMuted" />
  </layoutContainer>
);

/** Waveform display using Pixi Graphics */
const WaveformSection: React.FC<{
  section: WaveformDef;
  config: Record<string, unknown>;
  theme: ReturnType<typeof usePixiTheme>;
  accentColor: number;
}> = ({ section, config, theme, accentColor }) => {
  const data = (deepGet(config, section.key) as number[] | Int8Array | undefined) ?? [];

  const drawWaveform = useCallback(
    (g: GraphicsType) => {
      g.clear();
      g.rect(0, 0, CHART_W, WAVE_H).fill({ color: theme.bg.color });

      // Centre line
      const mid = WAVE_H / 2;
      g.moveTo(0, mid).lineTo(CHART_W, mid).stroke({ color: theme.border.color, width: 1 });

      if (!data || data.length === 0) return;

      const len = section.maxLen ? Math.min(data.length, section.maxLen) : data.length;
      g.moveTo(0, mid);
      for (let x = 0; x < CHART_W; x++) {
        const i = Math.floor((x / CHART_W) * len);
        const s = Number(data[i] ?? 0);
        const y = mid - (s / 128) * (mid - 2);
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke({ color: accentColor, width: 1.5 });
    },
    [data, section.maxLen, theme.bg.color, theme.border.color, accentColor],
  );

  return (
    <layoutContainer layout={{ flexDirection: 'column', gap: 4 }}>
      <SectionHead text={section.label} />
      <layoutContainer
        layout={{
          width: CHART_W,
          height: WAVE_H,
          borderWidth: 1,
          borderColor: theme.border.color,
          borderRadius: 4,
        }}
      >
        <pixiGraphics draw={drawWaveform} layout={{ width: CHART_W, height: WAVE_H }} />
      </layoutContainer>
    </layoutContainer>
  );
};

/** Bar chart for table data (ADSR, LFO, EG, etc.) */
const BarChartSection: React.FC<{
  section: BarChartDef;
  config: Record<string, unknown>;
  theme: ReturnType<typeof usePixiTheme>;
  accentColor: number;
}> = ({ section, config, theme, accentColor }) => {
  const data = (deepGet(config, section.key) as number[] | Uint8Array | undefined) ?? [];

  const drawChart = useCallback(
    (g: GraphicsType) => {
      g.clear();
      g.rect(0, 0, CHART_W, CHART_H).fill({ color: theme.bg.color });

      if (!data || data.length === 0) return;

      const len = Math.min(data.length, 128);
      const barW = Math.max(1, CHART_W / len);

      if (section.signed) {
        const mid = CHART_H / 2;
        g.moveTo(0, mid).lineTo(CHART_W, mid).stroke({ color: theme.border.color, width: 1 });

        for (let i = 0; i < len; i++) {
          const v = Number(data[i] ?? 0);
          const normH = (Math.abs(v) / 128) * mid;
          const x = (i / len) * CHART_W;
          if (v >= 0) {
            g.rect(x, mid - normH, barW, normH).fill({ color: accentColor });
          } else {
            g.rect(x, mid, barW, normH).fill({ color: accentColor });
          }
        }
      } else {
        for (let i = 0; i < len; i++) {
          const v = Number(data[i] ?? 0);
          const barH = (v / 255) * CHART_H;
          const x = (i / len) * CHART_W;
          g.rect(x, CHART_H - barH, barW, barH).fill({ color: accentColor });
        }
      }
    },
    [data, section.signed, theme.bg.color, theme.border.color, accentColor],
  );

  return (
    <layoutContainer layout={{ flexDirection: 'column', gap: 4 }}>
      <SectionHead text={section.label} />
      <layoutContainer
        layout={{
          width: CHART_W,
          height: CHART_H,
          borderWidth: 1,
          borderColor: theme.border.color,
          borderRadius: 4,
        }}
      >
        <pixiGraphics draw={drawChart} layout={{ width: CHART_W, height: CHART_H }} />
      </layoutContainer>
    </layoutContainer>
  );
};

/** Sequence display (read-only visualization of arpeggio/volume/frequency sequences) */
const SequenceSection: React.FC<{
  section: SequenceDef;
  data: number[];
  theme: ReturnType<typeof usePixiTheme>;
  accentColor: number;
}> = ({ section, data, theme, accentColor }) => {
  const len = Math.min(data.length, section.length);
  const drawSeq = useCallback(
    (g: GraphicsType) => {
      g.clear();
      const W = CHART_W;
      const H = 40;
      g.rect(0, 0, W, H).fill({ color: theme.bg.color });

      if (len === 0) return;

      const cellW = W / section.length;
      const range = section.max - section.min;
      const mid = section.signed ? H / 2 : H;

      if (section.signed) {
        g.moveTo(0, mid).lineTo(W, mid).stroke({ color: theme.border.color, width: 1 });
      }

      for (let i = 0; i < len; i++) {
        const v = data[i] ?? 0;
        const norm = (v - section.min) / range;
        const barH = norm * H;
        const x = i * cellW;
        if (section.signed) {
          const absH = (Math.abs(v) / Math.max(Math.abs(section.min), section.max)) * mid;
          if (v >= 0) {
            g.rect(x, mid - absH, cellW - 1, absH).fill({ color: accentColor });
          } else {
            g.rect(x, mid, cellW - 1, absH).fill({ color: accentColor });
          }
        } else {
          g.rect(x, H - barH, cellW - 1, barH).fill({ color: accentColor });
        }
      }
    },
    [data, len, section, theme, accentColor],
  );

  return (
    <layoutContainer layout={{ flexDirection: 'column', gap: 4 }}>
      <SectionHead text={section.label} />
      <layoutContainer
        layout={{
          width: CHART_W,
          height: 40,
          borderWidth: 1,
          borderColor: theme.border.color,
          borderRadius: 4,
        }}
      >
        <pixiGraphics draw={drawSeq} layout={{ width: CHART_W, height: 40 }} />
      </layoutContainer>
    </layoutContainer>
  );
};

/** Arpeggio tables display (read-only visualization of 2-3 sub-tables) */
const ArpeggioSection: React.FC<{
  arps: { length: number; repeat: number; values: number[] }[];
  theme: ReturnType<typeof usePixiTheme>;
  accentColor: number;
}> = ({ arps, theme, accentColor }) => {
  if (!arps || arps.length === 0) return null;

  const drawArps = useCallback(
    (g: GraphicsType) => {
      g.clear();
      const W = CHART_W;
      const rowH = 24;
      const H = rowH * arps.length;
      g.rect(0, 0, W, H).fill({ color: theme.bg.color });

      for (let t = 0; t < arps.length; t++) {
        const arp = arps[t];
        const y0 = t * rowH;
        const mid = y0 + rowH / 2;
        const maxVals = Math.min(arp.values.length, 14);
        const cellW = W / 14;

        // Separator line
        if (t > 0) {
          g.moveTo(0, y0).lineTo(W, y0).stroke({ color: theme.border.color, width: 1 });
        }

        // Centre line
        g.moveTo(0, mid).lineTo(W, mid).stroke({ color: theme.border.color, alpha: 0.3, width: 1 });

        for (let i = 0; i < maxVals; i++) {
          const v = arp.values[i] ?? 0;
          const inRange = i < arp.length;
          const barH = (Math.abs(v) / 128) * (rowH / 2 - 2);
          const x = i * cellW;

          if (inRange) {
            if (v >= 0) {
              g.rect(x + 1, mid - barH, cellW - 2, barH).fill({ color: accentColor, alpha: 0.8 });
            } else {
              g.rect(x + 1, mid, cellW - 2, barH).fill({ color: accentColor, alpha: 0.8 });
            }
          } else {
            // Dim out-of-range
            if (v !== 0) {
              if (v >= 0) {
                g.rect(x + 1, mid - barH, cellW - 2, barH).fill({ color: accentColor, alpha: 0.15 });
              } else {
                g.rect(x + 1, mid, cellW - 2, barH).fill({ color: accentColor, alpha: 0.15 });
              }
            }
          }
        }
      }
    },
    [arps, theme, accentColor],
  );

  const totalH = 24 * arps.length;
  return (
    <layoutContainer layout={{ flexDirection: 'column', gap: 4 }}>
      <SectionHead text={`ARPEGGIOS (${arps.length} TABLES)`} />
      <layoutContainer
        layout={{
          width: CHART_W,
          height: totalH,
          borderWidth: 1,
          borderColor: theme.border.color,
          borderRadius: 4,
        }}
      >
        <pixiGraphics draw={drawArps} layout={{ width: CHART_W, height: totalH }} />
      </layoutContainer>
    </layoutContainer>
  );
};
