/**
 * PixiNavBar — Top navigation bar matching the DOM NavBar layout.
 *
 * Two rows:
 *   Row 1 (main nav):
 *     Left:   "DEViLBOX" logo + version badge
 *     Right:  Sign In, Collab, Desktop App, DOM, Info, Sets, MIDI, Theme, Volume
 *   Row 2 (tab bar):
 *     Project tabs + "+" add button
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Container as ContainerType } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';
import { PixiButton } from '../components/PixiButton';
import { PixiSlider } from '../components/PixiSlider';
import { PixiSelect } from '../components/PixiSelect';
import { usePixiResponsive } from '../hooks/usePixiResponsive';
import { useUIStore } from '@stores/useUIStore';
import { useMIDIStore } from '@stores/useMIDIStore';
import { MODERN_NAV_H } from '../workbench/workbenchLayout';
import { BUILD_NUMBER } from '@constants/version';
import { usePixiDropdownStore } from '../stores/usePixiDropdownStore';
import { PixiDJSetBrowser } from '../views/dj/PixiDJSetBrowser';
import { useNavBar } from '@hooks/views/useNavBar';
import { NAV_BAR_VIEWS } from '@/constants/viewOptions';
import { switchView } from '@/constants/viewOptions';
import type { FederatedPointerEvent } from 'pixi.js';
import type { ProjectTab } from '@stores';
import { getLucideTexture, preloadLucideIcons } from '../utils/lucideToTexture';
import {
  ICON_LOG_IN, ICON_USERS, ICON_DOWNLOAD, ICON_MONITOR,
  ICON_INFO, ICON_MUSIC, ICON_X, ICON_PLUS,
} from '../utils/lucideIcons';

const NAV_ROW_H = 42;
const TAB_ROW_H = MODERN_NAV_H - NAV_ROW_H; // 34px — matches DOM's ~32px tab bar

const VIEW_SELECT_OPTIONS = NAV_BAR_VIEWS.map(v => ({ value: v.value, label: v.shortLabel }));

// ─── PixiNavBar ──────────────────────────────────────────────────────────────

export const PixiNavBar: React.FC = () => {
  const theme = usePixiTheme();
  const { width } = usePixiResponsive();

  const n = useNavBar();

  // ── Lucide icon textures for nav buttons ──────────────────────────────────
  const NAV_ICON = 14;
  const [navIconsReady, setNavIconsReady] = useState(false);
  useEffect(() => {
    const textColor = theme.text.color;
    const mutedColor = theme.textMuted.color;
    preloadLucideIcons([
      { name: 'log-in', iconNode: ICON_LOG_IN, size: NAV_ICON, color: mutedColor },
      { name: 'users', iconNode: ICON_USERS, size: NAV_ICON, color: mutedColor },
      { name: 'download', iconNode: ICON_DOWNLOAD, size: NAV_ICON, color: textColor },
      { name: 'monitor', iconNode: ICON_MONITOR, size: NAV_ICON, color: mutedColor },
      { name: 'info', iconNode: ICON_INFO, size: NAV_ICON, color: mutedColor },
      { name: 'music', iconNode: ICON_MUSIC, size: NAV_ICON, color: mutedColor },
      { name: 'x-close', iconNode: ICON_X, size: 12, color: mutedColor },
      { name: 'plus-add', iconNode: ICON_PLUS, size: NAV_ICON, color: mutedColor },
    ]).then(() => setNavIconsReady(true));
  }, [theme]);

  const navIcons = useMemo(() => {
    if (!navIconsReady) return null;
    const textColor = theme.text.color;
    const mutedColor = theme.textMuted.color;
    return {
      logIn: getLucideTexture('log-in', ICON_LOG_IN, NAV_ICON, mutedColor),
      users: getLucideTexture('users', ICON_USERS, NAV_ICON, mutedColor),
      download: getLucideTexture('download', ICON_DOWNLOAD, NAV_ICON, textColor),
      monitor: getLucideTexture('monitor', ICON_MONITOR, NAV_ICON, mutedColor),
      info: getLucideTexture('info', ICON_INFO, NAV_ICON, mutedColor),
      music: getLucideTexture('music', ICON_MUSIC, NAV_ICON, mutedColor),
      xClose: getLucideTexture('x-close', ICON_X, 12, mutedColor),
      plus: getLucideTexture('plus-add', ICON_PLUS, NAV_ICON, mutedColor),
    };
  }, [navIconsReady, theme]);

  // Theme options for PixiSelect
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

  return (
    <layoutContainer
      layout={{
        width,
        height: MODERN_NAV_H,
        flexDirection: 'column',
        backgroundColor: theme.bgSecondary.color,
        borderBottomWidth: 1,
        borderColor: theme.border.color,
      }}
    >

      {/* ── Main nav row ── */}
      <pixiContainer layout={{ width, height: NAV_ROW_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>

      {/* ═══ Left zone: Logo + version badge + view dropdown ═══ */}
      <pixiContainer
        layout={{
          height: NAV_ROW_H,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 16,
          gap: 8,
          flexShrink: 0,
        }}
      >
        {/* Logo */}
        <pixiBitmapText
          text="DEViLBOX"
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 16, fill: 0xffffff }}
          tint={theme.text.color}
          layout={{}}
        />

        {/* Version badge — matches DOM's accent-colored badge */}
        <layoutContainer
          layout={{
            paddingLeft: 6,
            paddingRight: 6,
            paddingTop: 2,
            paddingBottom: 2,
            backgroundColor: theme.accent.color,
            borderRadius: 3,
          }}
          eventMode="static"
          cursor="help"
        >
          <pixiBitmapText
            text={`1.0.${BUILD_NUMBER}`}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
            tint={0x000000}
            layout={{}}
            eventMode="none"
          />
        </layoutContainer>

      </pixiContainer>

      {/* ═══ Right zone: Actions matching DOM layout ═══ */}
      <pixiContainer
        layout={{
          height: NAV_ROW_H,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingRight: 12,
          gap: 8,
          flexShrink: 0,
        }}
      >
        {/* Auth — Sign In / username (matches DOM's LogIn icon + text) */}
        <pixiContainer ref={authContainerRef} layout={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {!n.authUser && navIcons?.logIn && (
            <pixiSprite texture={navIcons.logIn} width={NAV_ICON} height={NAV_ICON} eventMode="none" />
          )}
          <PixiButton
            label={n.authUser ? n.authUser.username.slice(0, 8) : 'Sign In'}
            variant="ghost"
            size="sm"
            onClick={handleAuthClick}
            width={n.authUser ? 56 : 56}
          />
        </pixiContainer>

        {/* Collaboration (matches DOM's Users icon + Collab text) */}
        <pixiContainer layout={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {navIcons?.users && (
            <pixiSprite texture={navIcons.users} width={NAV_ICON} height={NAV_ICON} eventMode="none" />
          )}
          <PixiButton
            label="Collab"
            variant={n.collabStatus === 'connected' ? 'primary' : 'ghost'}
            size="sm"
            active={n.collabStatus === 'connected'}
            onClick={n.handleOpenCollab}
            width={52}
          />
        </pixiContainer>

        {/* View switcher dropdown */}
        <PixiSelect
          options={VIEW_SELECT_OPTIONS}
          value={n.activeView}
          onChange={(v) => switchView(v, n.activeView)}
          width={90}
          height={24}
        />

        {/* Settings button */}
        <PixiButton
          label="Settings"
          variant="ghost"
          size="sm"
          onClick={() => useUIStore.getState().openModal('settings')}
          width={56}
        />

        {/* Desktop App download (matches DOM's Download icon + text) */}
        <pixiContainer layout={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {navIcons?.download && (
            <pixiSprite texture={navIcons.download} width={NAV_ICON} height={NAV_ICON} eventMode="none" />
          )}
          <PixiButton
            label="Desktop App"
            variant="primary"
            size="sm"
            onClick={n.handleOpenDownload}
            width={72}
          />
        </pixiContainer>

        {/* Switch to DOM mode (matches DOM's Monitor icon + DOM text) */}
        <pixiContainer layout={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {navIcons?.monitor && (
            <pixiSprite texture={navIcons.monitor} width={NAV_ICON} height={NAV_ICON} eventMode="none" />
          )}
          <PixiButton label="Dom" variant="ghost" size="sm" onClick={n.handleSwitchToDom} width={36} />
        </pixiContainer>

        {/* Info button moved to FT2 toolbar Row 4 */}

        {/* DJ Sets — only shown in DJ and VJ views */}
        {(n.activeView === 'dj' || n.activeView === 'vj') && <PixiDJSetBrowser />}

        {/* MIDI — matches DOM's Music icon + MIDI text */}
        <pixiContainer ref={midiContainerRef} layout={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {navIcons?.music && (
            <pixiSprite texture={navIcons.music} width={NAV_ICON} height={NAV_ICON} eventMode="none" />
          )}
          <PixiButton label="MIDI" variant="ghost" size="sm" onClick={handleMIDIClick} width={40} />
        </pixiContainer>

        {/* Theme Switcher (matches DOM's theme dropdown) */}
        <PixiSelect
          options={themeOptions}
          value={n.currentThemeId}
          onChange={n.setTheme}
          width={80}
          height={24}
          searchable
        />

        {/* Master Volume — horizontal slider matching DOM's <input type="range" class="w-24"> */}
        <PixiSlider
          value={n.masterVolume}
          min={-60}
          max={0}
          onChange={n.setMasterVolume}
          label="Vol"
          orientation="horizontal"
          length={96}
          thickness={4}
          handleWidth={12}
          handleHeight={18}
          defaultValue={0}
          layout={{}}
        />
      </pixiContainer>

      </pixiContainer>{/* end main nav row */}

      {/* ── Project tab bar row ── matching DOM: bg-dark-bgTertiary, px-2 py-1, border-b */}
      <layoutContainer
        layout={{
          width,
          height: TAB_ROW_H,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 8,
          paddingRight: 8,
          gap: 4,
          backgroundColor: theme.bgTertiary.color,
          borderTopWidth: 1,
          borderBottomWidth: 1,
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
                gap: 8,
                paddingLeft: 12,
                paddingRight: n.tabs.length > 1 ? 4 : 12,
                backgroundColor: isActive ? theme.bg.color : theme.bgSecondary.color,
                borderTopWidth: 1,
                borderLeftWidth: 1,
                borderRightWidth: 1,
                borderBottomWidth: isActive ? 0 : 1,
                borderColor: theme.border.color,
                borderTopLeftRadius: 6,
                borderTopRightRadius: 6,
                borderBottomLeftRadius: 0,
                borderBottomRightRadius: 0,
              }}
            >
              <pixiBitmapText
                text={tab.name || 'Untitled'}
                style={{ fontFamily: PIXI_FONTS.SANS_MEDIUM, fontSize: 14, fill: 0xffffff }}
                tint={isActive ? theme.text.color : theme.textSecondary.color}
                layout={{}}
                eventMode="none"
              />
              {tab.isDirty && (
                <pixiBitmapText
                  text="*"
                  style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 13, fill: 0xffffff }}
                  tint={theme.accent.color}
                  layout={{}}
                  eventMode="none"
                />
              )}
              {n.tabs.length > 1 && (
                <layoutContainer
                  eventMode="static"
                  cursor="pointer"
                  onPointerUp={(e: FederatedPointerEvent) => { e.stopPropagation(); n.closeTab(tab.id); }}
                  layout={{ width: 14, height: 14, justifyContent: 'center', alignItems: 'center' }}
                >
                  {navIcons?.xClose ? (
                    <pixiSprite texture={navIcons.xClose} width={12} height={12} eventMode="none" />
                  ) : (
                    <pixiBitmapText
                      text="x"
                      style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 10, fill: 0xffffff }}
                      tint={theme.textMuted.color}
                      layout={{}}
                      eventMode="none"
                    />
                  )}
                </layoutContainer>
              )}
            </layoutContainer>
          );
        })}

        {/* Add tab button — DOM: p-1.5 ml-1 rounded, Plus icon 16px */}
        <layoutContainer
          eventMode="static"
          cursor="pointer"
          onPointerUp={() => n.addTab()}
          layout={{
            width: 28,
            height: 28,
            justifyContent: 'center',
            alignItems: 'center',
            marginLeft: 4,
            borderRadius: 4,
          }}
        >
          {navIcons?.plus ? (
            <pixiSprite texture={navIcons.plus} width={NAV_ICON} height={NAV_ICON} eventMode="none" />
          ) : (
            <pixiBitmapText
              text="+"
              style={{ fontFamily: PIXI_FONTS.SANS_MEDIUM, fontSize: 16, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={{}}
              eventMode="none"
            />
          )}
        </layoutContainer>
      </layoutContainer>

    </layoutContainer>
  );
};
