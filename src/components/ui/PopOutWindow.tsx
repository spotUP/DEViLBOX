/**
 * PopOutWindow - Renders children into a separate browser window via React Portal.
 *
 * Because Zustand stores are module-level singletons (no Context wrapping),
 * window.open() + createPortal shares the same JS context. Knob changes in
 * the popup instantly update the main window — zero state sync needed.
 *
 * Clones all stylesheets from the parent window so Tailwind + CSS vars work.
 * Uses MutationObserver to mirror Vite HMR style injections during dev.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { notify } from '@stores/useNotificationStore';

/** Registry of open popout windows by name, used to focus existing windows */
const openPopouts = new Map<string, Window>();

/** Focus an existing popout window by name. Returns true if found and focused. */
// eslint-disable-next-line react-refresh/only-export-components
export function focusPopout(name: string): boolean {
  const win = openPopouts.get(name);
  if (win && !win.closed) {
    win.focus();
    return true;
  }
  return false;
}

interface PopOutWindowProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  width?: number;
  height?: number;
  children: React.ReactNode;
}

export const PopOutWindow: React.FC<PopOutWindowProps> = ({
  isOpen,
  onClose,
  title = 'DEViLBOX',
  width = 900,
  height = 600,
  children,
}) => {
  const popupRef = useRef<Window | null>(null);
  const closingRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [mountEl, setMountEl] = useState<HTMLDivElement | null>(null);

  // Stable ref for onClose so effect doesn't re-run on every render
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!isOpen) {
      // Close popup when isOpen goes false
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }
      popupRef.current = null;
      // Defer state updates to avoid synchronous setState in effect
      const frame = requestAnimationFrame(() => {
        setMountEl(null);
        setReady(false);
      });
      return () => cancelAnimationFrame(frame);
    }

    // If popup already exists and is open, just bring it to front
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.focus();
      return;
    }

    // Center on screen
    const left = Math.round(screen.width / 2 - width / 2);
    const top = Math.round(screen.height / 2 - height / 2);

    const features = [
      'popup=yes',
      `width=${width}`,
      `height=${height}`,
      `left=${left}`,
      `top=${top}`,
      'toolbar=no',
      'location=no',
      'menubar=no',
      'status=no',
    ].join(',');

    // Open popup with empty URL (about:blank is unavoidable, but we immediately write content)
    const popup = window.open('', '', features);

    if (!popup) {
      notify.warning('Popup blocked — please allow popups for this site');
      onClose();
      return;
    }

    popupRef.current = popup;
    openPopouts.set(title, popup);

    // Immediately write document content to replace about:blank display
    // The title in <title> tag will show in the window title bar
    popup.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>
      html, body { margin: 0; padding: 0; background: var(--color-bg, #0b0909); color: var(--color-text, #f2f0f0); overflow: auto; height: 100%; }
      #popout-root { display: inline-block; min-width: 100%; }
    </style></head><body><div id="popout-root"></div></body></html>`);
    popup.document.close();
    // Also set document.title directly for browsers that need it
    popup.document.title = title;

    const mount = popup.document.getElementById('popout-root') as HTMLDivElement;
    if (!mount) {
      console.error('[PopOutWindow] Failed to find popout-root element');
      popup.close();
      onClose();
      return;
    }

    // Clone all stylesheets from parent window
    const popupHead = popup.document.head;

    // Clone <style> tags (Vite-injected Tailwind, CSS modules, etc.)
    document.head.querySelectorAll('style').forEach((style) => {
      const clone = popup.document.createElement('style');
      clone.textContent = style.textContent;
      clone.dataset.cloned = 'true';
      popupHead.appendChild(clone);
    });

    // Clone <link rel="stylesheet"> tags
    document.head.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
      const clone = popup.document.createElement('link');
      clone.rel = 'stylesheet';
      clone.href = (link as HTMLLinkElement).href;
      clone.dataset.cloned = 'true';
      popupHead.appendChild(clone);
    });

    // Defer state updates to next frame to avoid synchronous setState in effect
    requestAnimationFrame(() => {
      setMountEl(mount);
      setReady(true);
    });

    // MutationObserver: mirror Vite HMR style injections during dev
    const observer = new MutationObserver((mutations) => {
      if (popup.closed) return;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLStyleElement) {
            const clone = popup.document.createElement('style');
            clone.textContent = node.textContent;
            clone.dataset.cloned = 'true';
            popup.document.head.appendChild(clone);
          }
          if (node instanceof HTMLLinkElement && node.rel === 'stylesheet') {
            const clone = popup.document.createElement('link');
            clone.rel = 'stylesheet';
            clone.href = node.href;
            clone.dataset.cloned = 'true';
            popup.document.head.appendChild(clone);
          }
        }
        for (const node of mutation.removedNodes) {
          if (popup.closed) return;
          if (node instanceof HTMLStyleElement || node instanceof HTMLLinkElement) {
            const clones = popup.document.head.querySelectorAll('[data-cloned="true"]');
            clones.forEach((clone) => {
              if (
                (clone instanceof HTMLStyleElement && node instanceof HTMLStyleElement &&
                  clone.textContent === node.textContent) ||
                (clone instanceof HTMLLinkElement && node instanceof HTMLLinkElement &&
                  clone.href === node.href)
              ) {
                clone.remove();
              }
            });
          }
        }
      }
    });
    observer.observe(document.head, { childList: true });

    // Handle popup close (user clicks X on popup window).
    // Defer onClose so React doesn't try to unmount the portal while
    // the popup DOM is mid-teardown (which causes a null error).
    closingRef.current = false;
    const handlePopupClose = () => {
      if (closingRef.current) return;
      closingRef.current = true;
      // Detach mount point immediately so React stops touching popup DOM
      setMountEl(null);
      setReady(false);
      // Defer the state update to next microtask
      setTimeout(() => onCloseRef.current(), 0);
    };
    popup.addEventListener('pagehide', handlePopupClose);
    popup.onbeforeunload = handlePopupClose;

    // Cleanup on unmount (e.g. parent sets isOpen=false)
    return () => {
      observer.disconnect();
      closingRef.current = true;
      openPopouts.delete(title);
      if (popup && !popup.closed) {
        popup.removeEventListener('pagehide', handlePopupClose);
        popup.onbeforeunload = null;
        popup.close();
      }
      popupRef.current = null;
      setMountEl(null);
      setReady(false);
    };
  }, [isOpen, title, width, height]);

  if (!isOpen || !ready || !mountEl) return null;

  return createPortal(children, mountEl);
};
