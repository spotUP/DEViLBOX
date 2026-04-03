/**
 * PixiWAMPluginBrowser — Pixi/GL version of the WAM plugin browser.
 * Visually 1:1 with DOM WAMPluginBrowser. Same hook data.
 */

import { useCallback, useState } from 'react';
import { PixiButton, PixiLabel, PixiScrollView } from '../components';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';
import { useWAMPluginBrowser } from '@/hooks/useWAMPluginBrowser';
import type { WAMPluginEntry } from '@/constants/wamPlugins';

interface PixiWAMPluginBrowserProps {
  width?: number;
  height?: number;
  onSelectPlugin: (url: string, name: string) => void;
  onClose?: () => void;
  typeFilter?: 'instrument' | 'effect';
}

const ITEM_H = 36;

export const PixiWAMPluginBrowser: React.FC<PixiWAMPluginBrowserProps> = ({
  width = 400,
  height = 400,
  onSelectPlugin,
  onClose,
  typeFilter,
}) => {
  const theme = usePixiTheme();
  const typeColors: Record<string, number> = {
    instrument: theme.accentHighlight.color,
    effect: theme.accentSecondary.color,
    utility: theme.accent.color,
  };
  const [search] = useState('');
  const [activeType, setActiveType] = useState<'instrument' | 'effect' | undefined>(typeFilter);

  const { groups, totalCount } = useWAMPluginBrowser({
    type: activeType,
    search: search || undefined,
  });

  const HEADER_H = 34;
  const FILTER_H = 30;
  const LIST_H = height - HEADER_H - FILTER_H;

  const contentHeight = groups.reduce(
    (h, g) => h + 20 + g.plugins.length * ITEM_H, 0
  );

  const handlePluginClick = useCallback((plugin: WAMPluginEntry) => {
    onSelectPlugin(plugin.url, plugin.name);
  }, [onSelectPlugin]);

  return (
    <layoutContainer
      layout={{
        width,
        height,
        flexDirection: 'column',
        backgroundColor: theme.bg.color,
        borderWidth: 1,
        borderColor: theme.border.color,
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <layoutContainer
        layout={{
          width,
          height: HEADER_H,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 10,
          paddingRight: 6,
          gap: 6,
          backgroundColor: theme.bgSecondary.color,
          borderBottomWidth: 1,
          borderColor: theme.border.color,
        }}
      >
        <PixiLabel text="WAM Plugins" size="sm" weight="semibold" font="sans" />
        <PixiLabel text={`(${totalCount})`} size="xs" color="textMuted" font="mono" />
        <layoutContainer layout={{ flex: 1 }} />
        {onClose && (
          <PixiButton label="x" variant="ghost" size="sm" onClick={onClose} width={20} height={20} />
        )}
      </layoutContainer>

      {/* Filter buttons */}
      <layoutContainer
        layout={{
          width,
          height: FILTER_H,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 8,
          gap: 4,
          borderBottomWidth: 1,
          borderColor: theme.border.color,
        }}
      >
        <PixiButton
          label="All"
          variant={!activeType ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => setActiveType(undefined)}
          width={36}
          height={22}
        />
        <PixiButton
          label="Synths"
          variant={activeType === 'instrument' ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => setActiveType('instrument')}
          width={52}
          height={22}
        />
        <PixiButton
          label="Effects"
          variant={activeType === 'effect' ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => setActiveType('effect')}
          width={52}
          height={22}
        />
      </layoutContainer>

      {/* Plugin list */}
      <PixiScrollView
        width={width}
        height={LIST_H}
        contentHeight={contentHeight}
        direction="vertical"
      >
        <layoutContainer layout={{ width: width - 8, flexDirection: 'column', padding: 4 }}>
          {groups.map((group) => (
            <layoutContainer key={group.category} layout={{ flexDirection: 'column', marginBottom: 4 }}>
              <pixiBitmapText
                text={group.category.toUpperCase()}
                style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
                tint={theme.textMuted.color}
                layout={{ marginBottom: 2, marginLeft: 4 }}
              />
              {group.plugins.map((plugin) => (
                <pixiContainer
                  key={plugin.url}
                  eventMode="static"
                  cursor="pointer"
                  onClick={() => handlePluginClick(plugin)}
                  layout={{ width: width - 16, height: ITEM_H, flexDirection: 'row', alignItems: 'center', paddingLeft: 8, gap: 6 }}
                >
                  {/* Type dot */}
                  <pixiGraphics
                    draw={(g) => {
                      g.clear();
                      g.circle(4, 4, 4);
                      g.fill({ color: typeColors[plugin.type] ?? theme.accent.color });
                    }}
                    layout={{ width: 8, height: 8 }}
                  />
                  <layoutContainer layout={{ flex: 1, flexDirection: 'column', gap: 1 }}>
                    <pixiBitmapText
                      text={plugin.name}
                      style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
                      tint={theme.text.color}
                      layout={{}}
                    />
                    <pixiBitmapText
                      text={plugin.description}
                      style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 10, fill: 0xffffff }}
                      tint={theme.textMuted.color}
                      layout={{}}
                    />
                  </layoutContainer>
                </pixiContainer>
              ))}
            </layoutContainer>
          ))}
        </layoutContainer>
      </PixiScrollView>
    </layoutContainer>
  );
};
