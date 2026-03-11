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
  /** Auto-resize popup to fit rendered content (one-shot after first paint) */
  fitContent?: boolean;
  children: React.ReactNode;
}

export const PopOutWindow: React.FC<PopOutWindowProps> = ({
  isOpen,
  onClose,
  title = 'DEViLBOX',
  width = 900,
  height = 600,
  fitContent = false,
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

    // Build HTML document for the popup
    const htmlContent = `<!DOCTYPE html><html><head><title>${title}</title><style>
      html, body { margin: 0; padding: 0; background: #0b0909; color: #f2f0f0; overflow: auto; height: 100%; }
      #popout-root { display: inline-block; min-width: 100%; }
    </style></head><body><div id="popout-root"></div></body></html>`;
    
    // Use Blob URL instead of about:blank to avoid the ugly URL in the title bar
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const blobUrl = URL.createObjectURL(blob);

    const popup = window.open(blobUrl, '', features);

    // Revoke the blob URL after the popup has loaded
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

    if (!popup) {
      URL.revokeObjectURL(blobUrl);
      notify.warning('Popup blocked — please allow popups for this site');
      onClose();
      return;
    }

    popupRef.current = popup;
    openPopouts.set(title, popup);

    // Variables for cleanup
    let resizeObserver: ResizeObserver | null = null;
    let observer: MutationObserver | null = null;

    // Wait for the blob content to load before accessing the document
    const setupPopup = () => {
      if (popup.closed) return;
      
      const mount = popup.document.getElementById('popout-root') as HTMLDivElement;
      if (!mount) {
        // Document not ready yet, retry
        setTimeout(setupPopup, 10);
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

      // Auto-resize popup to fit content after first render (opt-in)
      if (fitContent) {
        let resized = false;
        resizeObserver = new ResizeObserver(() => {
          if (resized || popup.closed) return;
          // Wait one frame for layout to settle
          requestAnimationFrame(() => {
            if (popup.closed) return;
            const contentWidth = mount.scrollWidth;
            const contentHeight = mount.scrollHeight;
            if (contentWidth > 0 && contentHeight > 0) {
              // Account for window chrome (title bar, borders)
              const chromeWidth = popup.outerWidth - popup.innerWidth;
              const chromeHeight = popup.outerHeight - popup.innerHeight;
              const targetW = contentWidth + chromeWidth;
              const targetH = contentHeight + chromeHeight;
              // Re-center after resize
              const newLeft = Math.round(screen.width / 2 - targetW / 2);
              const newTop = Math.round(screen.height / 2 - targetH / 2);
              popup.moveTo(Math.max(0, newLeft), Math.max(0, newTop));
              popup.resizeTo(
                Math.min(targetW, screen.availWidth),
                Math.min(targetH, screen.availHeight)
              );
              resized = true;
            }
          });
        });
        resizeObserver.observe(mount);
      }

      // MutationObserver: mirror Vite HMR style injections during dev
      observer = new MutationObserver((mutations) => {
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
    };

    // Start setup when popup is ready
    popup.addEventListener('load', setupPopup);
    // Fallback in case load event already fired
    setTimeout(setupPopup, 50);

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
      resizeObserver?.disconnect();
      observer?.disconnect();
      closingRef.current = true;
      openPopouts.delete(title);
      if (popup && !popup.closed) {
        popup.removeEventListener('pagehide', handlePopupClose);
        popup.removeEventListener('load', setupPopup);
        popup.onbeforeunload = null;
        popup.close();
      }
      popupRef.current = null;
      setMountEl(null);
      setReady(false);
    };
  }, [isOpen, title, width, height, fitContent]);

  if (!isOpen || !ready || !mountEl) return null;

  return createPortal(children, mountEl);
};
