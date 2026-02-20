/**
 * PixiToast — Toast notification display.
 * Subscribes to useNotificationStore and renders notifications
 * in the top-right area of the PixiJS canvas.
 */

import { useState, useEffect } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';

// Import notification store type
interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  timestamp: number;
}

// We'll subscribe to the same notification store used by the DOM UI
let notificationStore: { subscribe: (fn: (state: any) => void) => () => void; getState: () => any } | null = null;

// Lazy import to avoid circular deps
async function getNotificationStore() {
  if (!notificationStore) {
    const mod = await import('@stores/useNotificationStore');
    notificationStore = mod.useNotificationStore;
  }
  return notificationStore;
}

const TOAST_WIDTH = 280;
const TOAST_HEIGHT = 36;
const TOAST_GAP = 8;
const TOAST_MARGIN = 16;
const MAX_VISIBLE = 5;

export const PixiToast: React.FC = () => {
  const theme = usePixiTheme();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Subscribe to notification store
  useEffect(() => {
    let unsub: (() => void) | null = null;

    getNotificationStore().then(store => {
      if (!store) return;

      // Initial state
      const state = store.getState();
      if (state.notifications) {
        setNotifications(state.notifications.slice(-MAX_VISIBLE));
      }

      // Subscribe
      unsub = store.subscribe((state: any) => {
        if (state.notifications) {
          setNotifications(state.notifications.slice(-MAX_VISIBLE));
        }
      });
    });

    return () => { unsub?.(); };
  }, []);

  if (notifications.length === 0) return null;

  const getTypeColor = (type: string): number => {
    switch (type) {
      case 'success': return theme.success.color;
      case 'error': return theme.error.color;
      case 'warning': return theme.warning.color;
      default: return theme.accent.color;
    }
  };

  return (
    <pixiContainer
      layout={{
        position: 'absolute',
        right: TOAST_MARGIN,
        top: TOAST_MARGIN + 36, // Below nav bar
        width: TOAST_WIDTH,
        flexDirection: 'column',
        gap: TOAST_GAP,
      }}
    >
      {notifications.map((notif) => {
        const typeColor = getTypeColor(notif.type);

        return (
          <pixiContainer
            key={notif.id}
            layout={{
              width: TOAST_WIDTH,
              height: TOAST_HEIGHT,
              flexDirection: 'row',
              alignItems: 'center',
              paddingLeft: 10,
              paddingRight: 10,
            }}
          >
            <pixiGraphics
              draw={(g: GraphicsType) => {
                g.clear();
                // Background
                g.roundRect(0, 0, TOAST_WIDTH, TOAST_HEIGHT, 6);
                g.fill({ color: theme.bgSecondary.color, alpha: 0.95 });
                g.roundRect(0, 0, TOAST_WIDTH, TOAST_HEIGHT, 6);
                g.stroke({ color: typeColor, alpha: 0.4, width: 1 });
                // Left accent bar
                g.roundRect(0, 0, 3, TOAST_HEIGHT, 3);
                g.fill({ color: typeColor });
              }}
              layout={{ position: 'absolute', width: TOAST_WIDTH, height: TOAST_HEIGHT }}
            />

            <pixiBitmapText
              text={notif.message.length > 35 ? notif.message.substring(0, 35) + '...' : notif.message}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11 }}
              tint={theme.text.color}
              layout={{ marginLeft: 8 }}
            />
          </pixiContainer>
        );
      })}
    </pixiContainer>
  );
};
