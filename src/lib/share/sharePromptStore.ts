import { create } from 'zustand';

interface SharePromptState {
  /** The song a share link just opened, until Play or close. */
  name: string | null;
  /** A made link the browser would not copy, shown for copying by hand. */
  link: string | null;
  show: (name: string) => void;
  dismiss: () => void;
  showLink: (link: string) => void;
  dismissLink: () => void;
}

export const useSharePromptStore = create<SharePromptState>((set) => ({
  name: null,
  link: null,
  show: (name) => set({ name }),
  dismiss: () => set({ name: null }),
  showLink: (link) => set({ link }),
  dismissLink: () => set({ link: null }),
}));
