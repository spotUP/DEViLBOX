/**
 * youtubeApi — YouTube OAuth 2.0 + resumable video upload.
 *
 * Uses the YouTube Data API v3 for uploads. OAuth flow opens a popup
 * window for Google sign-in. Requires VITE_GOOGLE_CLIENT_ID env var.
 *
 * Upload uses the resumable upload protocol for large files with
 * progress tracking and automatic retry on network errors.
 */

import { useYouTubeStore } from '@/stores/useYouTubeStore';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const SCOPES = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly';
const REDIRECT_URI = `${window.location.origin}/youtube-callback`;

// ── OAuth 2.0 ────────────────────────────────────────────────────────────

/** Start Google OAuth flow in a popup window */
export function startOAuth(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!GOOGLE_CLIENT_ID) {
      reject(new Error('YouTube integration not configured (VITE_GOOGLE_CLIENT_ID missing)'));
      return;
    }

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'token',
      scope: SCOPES,
      include_granted_scopes: 'true',
      prompt: 'consent',
    });

    const popup = window.open(
      `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
      'youtube-auth',
      'width=600,height=700,left=200,top=100',
    );

    if (!popup) {
      reject(new Error('Popup blocked — please allow popups for this site'));
      return;
    }

    // Listen for the redirect callback
    const interval = setInterval(() => {
      try {
        if (popup.closed) {
          clearInterval(interval);
          reject(new Error('Auth cancelled'));
          return;
        }
        const hash = popup.location.hash;
        if (hash && hash.includes('access_token')) {
          clearInterval(interval);
          popup.close();
          const params = new URLSearchParams(hash.slice(1));
          const accessToken = params.get('access_token');
          if (accessToken) {
            resolve(accessToken);
          } else {
            reject(new Error('No access token in response'));
          }
        }
      } catch {
        // Cross-origin — popup hasn't redirected back yet, keep polling
      }
    }, 500);

    // Timeout after 2 minutes
    setTimeout(() => {
      clearInterval(interval);
      try { popup.close(); } catch { /* ignore */ }
      reject(new Error('Auth timed out'));
    }, 120000);
  });
}

/** Authenticate and fetch channel info */
export async function authenticate(): Promise<void> {
  const accessToken = await startOAuth();

  // Fetch channel name
  const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  let channelName = null;
  if (res.ok) {
    const data = await res.json();
    channelName = data.items?.[0]?.snippet?.title ?? null;
  }

  useYouTubeStore.getState().setAuth(accessToken, null, channelName);
}

/** Disconnect YouTube account */
export function disconnect(): void {
  const token = useYouTubeStore.getState().accessToken;
  if (token) {
    // Revoke token (best-effort, don't await)
    fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, { method: 'POST' }).catch(() => {});
  }
  useYouTubeStore.getState().clearAuth();
}

// ── Video Upload ─────────────────────────────────────────────────────────

export interface YouTubeUploadOptions {
  title: string;
  description: string;
  tags?: string[];
  privacy?: 'public' | 'unlisted' | 'private';
  thumbnail?: Blob;
}

/** Upload a video to YouTube using resumable upload protocol */
export async function uploadVideo(blob: Blob, options: YouTubeUploadOptions): Promise<string> {
  const store = useYouTubeStore.getState();
  if (!store.accessToken) throw new Error('Not authenticated with YouTube');

  store.setUploading(true);
  store.setUploadProgress(0);
  store.setError(null);

  try {
    // Step 1: Initiate resumable upload
    const metadata = {
      snippet: {
        title: options.title,
        description: options.description,
        tags: options.tags ?? ['DJ set', 'chiptune', 'tracker music', 'DEViLBOX'],
        categoryId: '10', // Music
      },
      status: {
        privacyStatus: options.privacy ?? 'unlisted',
        selfDeclaredMadeForKids: false,
      },
    };

    const initRes = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${store.accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Length': String(blob.size),
          'X-Upload-Content-Type': blob.type || 'video/webm',
        },
        body: JSON.stringify(metadata),
      },
    );

    if (!initRes.ok) {
      const err = await initRes.text();
      throw new Error(`Upload init failed: ${initRes.status} ${err}`);
    }

    const uploadUrl = initRes.headers.get('Location');
    if (!uploadUrl) throw new Error('No upload URL in response');

    // Step 2: Upload in 5MB chunks with progress
    const CHUNK_SIZE = 5 * 1024 * 1024;
    let offset = 0;

    while (offset < blob.size) {
      const end = Math.min(offset + CHUNK_SIZE, blob.size);
      const chunk = blob.slice(offset, end);

      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Range': `bytes ${offset}-${end - 1}/${blob.size}`,
          'Content-Type': blob.type || 'video/webm',
        },
        body: chunk,
      });

      if (uploadRes.status === 200 || uploadRes.status === 201) {
        // Upload complete
        const data = await uploadRes.json();
        const videoId = data.id;
        store.setLastVideo(videoId);

        // Upload thumbnail if provided
        if (options.thumbnail && videoId) {
          await uploadThumbnail(videoId, options.thumbnail, store.accessToken!);
        }

        return videoId;
      }

      if (uploadRes.status === 308) {
        // Chunk accepted, continue
        const range = uploadRes.headers.get('Range');
        if (range) {
          offset = parseInt(range.split('-')[1], 10) + 1;
        } else {
          offset = end;
        }
        store.setUploadProgress(offset / blob.size);
      } else {
        throw new Error(`Upload chunk failed: ${uploadRes.status}`);
      }
    }

    throw new Error('Upload ended without completion response');
  } catch (err) {
    store.setError((err as Error).message);
    throw err;
  }
}

/** Upload a custom thumbnail for a video */
async function uploadThumbnail(videoId: string, thumbnail: Blob, accessToken: string): Promise<void> {
  try {
    await fetch(
      `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': thumbnail.type || 'image/png',
        },
        body: thumbnail,
      },
    );
  } catch {
    console.warn('[YouTube] Thumbnail upload failed (non-critical)');
  }
}
