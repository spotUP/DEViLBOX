/**
 * PixiNavBar — Modern single-row navigation bar.
 *
 * Three zones:
 *   Left (460px):  Logo + view selector pills (Tracker, Arrange, Piano, DJ, VJ, Studio)
 *   Center (flex):  PixiTransportBar (play/stop/BPM/position/loop)
 *   Right:  Volume knob, Save, Load, Collab, Auth, MIDI, Theme, Dock, DOM
 */

import React, { useCallback, useRef } from 'react';
import type { Container as ContainerType } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';
import { PixiButton } from '../components/PixiButton';
import { PixiKnob } from '../components/PixiKnob';
import { PixiSelect } from '../components/PixiSelect';
import { usePixiResponsive } from '../hooks/usePixiResponsive';
import { useUIStore } from '@stores/useUIStore';
import { useMIDIStore } from '@stores/useMIDIStore';
import { MODERN_NAV_H } from '../workbench/workbenchLayout';
import { PixiTransportBar } from './PixiTransportBar';
import { BUILD_VERSION } from '@constants/version';
import { usePixiDropdownStore } from '../stores/usePixiDropdownStore';
import { PixiDJSetBrowser } from '../views/dj/PixiDJSetBrowser';
import { useNavBar, VIEW_TABS, type ViewTabId } from '@hooks/views/useNavBar';
import type { FederatedPointerEvent } from 'pixi.js';
import type { ProjectTab } from '@stores';

const NAV_ROW_H = 52;
const TAB_ROW_H = MODERN_NAV_H - NAV_ROW_H; // 24px

// ─── PixiNavBar ──────────────────────────────────────────────────────────────

export const PixiNavBar: React.FC = () => {
  const theme = usePixiTheme();
  const { width } = usePixiResponsive();

  const n = useNavBar();

  // Pixi-specific: themeOptions need SelectOption shape (already compatible via NavBarThemeOption)
  const themeOptions = n.themeOptions;

  // MIDI device quick-picker (Pixi-specific dropdown UX)
  const midiContainerRef = useRef<ContainerType>(null);
  const MIDI_DROPDOWN_ID = 'nav-midi';
  const handleMIDIClick = useCallback(() => {
    const el = midiContainerRef.current;
    if (!el) return;
    const pos = el.toGlobal({ x: 0, y: NAV_ROW_H });
    const { inputDevices: devs, selectedInputId: selId } = useMIDIStore.getState();
    const deviceOptions = devs.map((d) => ({
      value: d.id,
      label: (selId === d.id ? '\u25cf ' : '\u25cb ') + d.name.slice(0, 18),
    }));
    requestAnimationFrame(() => {
      usePixiDropdownStore.getState().openDropdown({
        kind: 'select',
        id: MIDI_DROPDOWN_ID,
        x: pos.x,
        y: pos.y,
        width: 200,
        options: [
          { value: '__inp__', label: 'INPUT DEVICE' },
          ...(deviceOptions.length > 0 ? deviceOptions : [{ value: '__none__', label: 'No devices found', disabled: true }]),
          { value: '_settings', label: 'MIDI Settings...' },
        ],
        onSelect: (v) => {
          if (v === '_settings') {
            useUIStore.getState().openModal('settings');
          } else if (v !== '__inp__' && v !== '__none__') {
            useMIDIStore.getState().selectInput(v);
          }
          usePixiDropdownStore.getState().closeDropdown(MIDI_DROPDOWN_ID);
        },
        onClose: () => usePixiDropdownStore.getState().closeDropdown(MIDI_DROPDOWN_ID),
      });
    });
  }, []);

  // Auth dropdown (Pixi-specific UX)
  const authContainerRef = useRef<ContainerType>(null);
  const AUTH_DROPDOWN_ID = 'nav-auth';
  const handleAuthClick = useCallback(() => {
    if (!n.authUser) { n.handleOpenAuth(); return; }
    const el = authContainerRef.current;
    if (!el) return;
    const pos = el.toGlobal({ x: 0, y: NAV_ROW_H });
    requestAnimationFrame(() => {
      usePixiDropdownStore.getState().openDropdown({
        kind: 'select',
        id: AUTH_DROPDOWN_ID,
        x: pos.x,
        y: pos.y,
        width: 130,
        options: [
          { value: '__user__', label: `@${n.authUser!.username}`, disabled: true },
          { value: 'logout', label: 'Sign Out' },
        ],
        onSelect: (v) => {
          if (v === 'logout') n.logout();
          usePixiDropdownStore.getState().closeDropdown(AUTH_DROPDOWN_ID);
        },
        onClose: () => usePixiDropdownStore.getState().closeDropdown(AUTH_DROPDOWN_ID),
      });
    });
  }, [n.authUser, n.handleOpenAuth, n.logout]);

  // Transport bar width: center zone gets whatever's left after left/right
  const LEFT_W = 460;
  const RIGHT_W = 488;
  const transportW = Math.max(200, width - LEFT_W - RIGHT_W);

  return (
    <layoutContainer
      layout={{
        width,
        height: MODERN_NAV_H,
        flexDirection: 'column',
        backgroundColor: theme.bgTertiary.color,
        borderBottomWidth: 1,
        borderColor: theme.border.color,
      }}
    >

      {/* ── Main nav row ── */}
      <pixiContainer layout={{ width, height: NAV_ROW_H, flexDirection: 'row', alignItems: 'center', flexShrink: 0 }}>

      {/* ═══ Left zone: Logo + view selector pills ═══ */}
      <pixiContainer
        layout={{
          width: LEFT_W,
          height: NAV_ROW_H,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 16,
          gap: 6,
          flexShrink: 0,
        }}
      >
        {/* Logo */}
        <pixiBitmapText
          text="DEViLBOX"
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 16, fill: 0xffffff }}
          tint={theme.accent.color}
          layout={{ marginRight: 12 }}
        />

        {/* View selector buttons */}
        {VIEW_TABS.map(({ id, label }) => {
          const isActive = n.activeView === id;
          return (
            <PixiButton
              key={id}
              label={label}
              variant="ft2"
              size="sm"
              active={isActive}
              onClick={() => n.handleSwitchView(id as ViewTabId)}
            />
          );
        })}
      </pixiContainer>

      {/* ═══ Center zone: Transport ═══ */}
      <PixiTransportBar width={transportW} height={NAV_ROW_H} />

      {/* ═══ Right zone: Volume, Actions, Status ═══ */}
      <pixiContainer
        layout={{
          width: RIGHT_W,
          height: NAV_ROW_H,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingRight: 12,
          gap: 4,
          flexShrink: 0,
        }}
      >
        {/* Master Volume */}
        <PixiKnob
          value={n.masterVolume}
          min={-60}
          max={0}
          onChange={n.setMasterVolume}
          label="VOL"
          unit="dB"
          size="sm"
          defaultValue={0}
          formatValue={(v) => `${v.toFixed(0)}`}
          layout={{ marginRight: 4 }}
        />

        <PixiButton label="SAVE" variant="ghost" size="sm" onClick={n.handleSaveFile} width={44} />
        <PixiButton label="LOAD" variant="ghost" size="sm" onClick={n.handleLoadFile} width={44} />
        <PixiButton label="INFO" variant="ghost" size="sm" onClick={n.handleOpenModuleInfo} width={40} />

        {/* Collaboration */}
        <PixiButton
          label={n.collabStatus === 'connected' ? 'LIVE' : 'COLLAB'}
          variant={n.collabStatus === 'connected' ? 'ft2' : 'ghost'}
          color={n.collabStatus === 'connected' ? 'green' : 'default'}
          size="sm"
          active={n.collabStatus === 'connected'}
          onClick={n.handleOpenCollab}
          width={48}
        />

        {/* DJ Sets */}
        <PixiDJSetBrowser />

        {/* Auth — shows sign-out dropdown when logged in */}
        <pixiContainer ref={authContainerRef} layout={{ flexShrink: 0 }}>
          <PixiButton
            label={n.authUser ? n.authUser.username.slice(0, 6) : 'LOGIN'}
            variant="ghost"
            size="sm"
            onClick={handleAuthClick}
            width={44}
          />
        </pixiContainer>

        {/* MIDI — opens device picker dropdown */}
        {n.hasMIDI && (
          <pixiContainer ref={midiContainerRef} layout={{ flexShrink: 0 }}>
            <PixiButton label="MIDI" variant="ghost" size="sm" onClick={handleMIDIClick} width={40} />
          </pixiContainer>
        )}

        {/* Exposé — shows in all views */}
        <PixiButton
          label="EXPOSÉ"
          variant={n.exposeActive ? 'ft2' : 'ghost'}
          size="sm"
          active={n.exposeActive}
          onClick={n.handleExpose}
          width={56}
        />

        {/* AI Assistant */}
        <PixiButton
          label="AI"
          variant={n.aiPanelOpen ? 'ft2' : 'ghost'}
          size="sm"
          active={n.aiPanelOpen}
          onClick={n.toggleAI}
          width={28}
        />

        <PixiSelect
          options={themeOptions}
          value={n.currentThemeId}
          onChange={n.setTheme}
          width={80}
          height={24}
          searchable
        />
        <PixiButton label="APP" variant="ghost" size="sm" onClick={n.handleOpenDownload} width={36} />
        <PixiButton label="DOM" variant="ghost" size="sm" onClick={n.handleSwitchToDom} width={36} />

        {/* Build version badge */}
        <pixiBitmapText
          text={BUILD_VERSION}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{ marginLeft: 4 }}
        />
      </pixiContainer>

      </pixiContainer>{/* end main nav row */}

      {/* ── Project tab bar row ── */}
      <layoutContainer
        layout={{
          width,
          height: TAB_ROW_H,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 8,
          paddingRight: 8,
          gap: 2,
          backgroundColor: theme.bgSecondary.color,
          borderTopWidth: 1,
          borderColor: theme.border.color,
          flexShrink: 0,
        }}
      >
        {n.tabs.map((tab: ProjectTab) => {
          const isActive = tab.id === n.activeTabId;
          return (
            <layoutContainer
              key={tab.id}
              eventMode="static"
              cursor="pointer"
              onPointerUp={() => n.setActiveTab(tab.id)}
              layout={{
                height: TAB_ROW_H - 4,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingLeft: 8,
                paddingRight: n.tabs.length > 1 ? 4 : 8,
                backgroundColor: isActive ? theme.bg.color : theme.bgTertiary.color,
                borderWidth: 1,
                borderColor: isActive ? theme.accent.color : theme.border.color,
                borderRadius: 3,
              }}
            >
              <pixiBitmapText
                text={(tab.name || 'Untitled').toUpperCase() + (tab.isDirty ? ' *' : '')}
                style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
                tint={isActive ? theme.text.color : theme.textMuted.color}
                layout={{}}
                eventMode="none"
              />
              {n.tabs.length > 1 && (
                <layoutContainer
                  eventMode="static"
                  cursor="pointer"
                  onPointerUp={(e: FederatedPointerEvent) => { e.stopPropagation(); n.closeTab(tab.id); }}
                  layout={{ width: 12, height: 12, justifyContent: 'center', alignItems: 'center' }}
                >
                  <pixiBitmapText
                    text="x"
                    style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 9, fill: 0xffffff }}
                    tint={theme.textMuted.color}
                    layout={{}}
                    eventMode="none"
                  />
                </layoutContainer>
              )}
            </layoutContainer>
          );
        })}

        {/* Add tab button */}
        <layoutContainer
          eventMode="static"
          cursor="pointer"
          onPointerUp={() => n.addTab()}
          layout={{
            width: TAB_ROW_H - 4,
            height: TAB_ROW_H - 4,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: theme.bgTertiary.color,
            borderWidth: 1,
            borderColor: theme.border.color,
            borderRadius: 3,
          }}
        >
          <pixiBitmapText
            text="+"
            style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 12, fill: 0xffffff }}
            tint={theme.textMuted.color}
            layout={{}}
            eventMode="none"
          />
        </layoutContainer>
      </layoutContainer>

    </layoutContainer>
  );
};
