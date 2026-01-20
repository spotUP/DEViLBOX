import { useState, useEffect } from 'react';
import { CURRENT_VERSION } from '@generated/changelog';

const STORAGE_KEY = 'devilbox-seen-version';

/**
 * Hook to manage What's New modal visibility
 */
export function useWhatsNew() {
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    // Check if user has seen the current version
    const seenVersion = localStorage.getItem(STORAGE_KEY);
    if (seenVersion !== CURRENT_VERSION) {
      // Show modal after a short delay so app has time to render
      const timer = setTimeout(() => setShowModal(true), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const closeModal = () => setShowModal(false);
  const openModal = () => setShowModal(true);

  return { showModal, closeModal, openModal };
}
