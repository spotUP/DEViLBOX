/**
 * useYouTubeStore — YouTube OAuth + upload state management.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface YouTubeState {
  isAuthenticated: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  channelName: string | null;
  uploading: boolean;
  uploadProgress: number;
  lastVideoId: string | null;
  lastVideoUrl: string | null;
  error: string | null;
}

interface YouTubeActions {
  setAuth: (accessToken: string, refreshToken: string | null, channelName: string | null) => void;
  clearAuth: () => void;
  setUploading: (uploading: boolean) => void;
  setUploadProgress: (progress: number) => void;
  setLastVideo: (videoId: string) => void;
  setError: (error: string | null) => void;
}

export const useYouTubeStore = create<YouTubeState & YouTubeActions>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      accessToken: null,
      refreshToken: null,
      channelName: null,
      uploading: false,
      uploadProgress: 0,
      lastVideoId: null,
      lastVideoUrl: null,
      error: null,

      setAuth: (accessToken, refreshToken, channelName) => set({
        isAuthenticated: true, accessToken, refreshToken, channelName, error: null,
      }),
      clearAuth: () => set({
        isAuthenticated: false, accessToken: null, refreshToken: null, channelName: null,
      }),
      setUploading: (uploading) => set({ uploading }),
      setUploadProgress: (progress) => set({ uploadProgress: progress }),
      setLastVideo: (videoId) => set({
        lastVideoId: videoId,
        lastVideoUrl: `https://www.youtube.com/watch?v=${videoId}`,
        uploading: false,
        uploadProgress: 1,
      }),
      setError: (error) => set({ error, uploading: false }),
    }),
    { name: 'devilbox-youtube', partialize: (s) => ({ accessToken: s.accessToken, refreshToken: s.refreshToken, channelName: s.channelName, isAuthenticated: s.isAuthenticated }) },
  ),
);
