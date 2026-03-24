/**
 * DJYouTubeUpload — Upload recorded video to YouTube.
 *
 * Shows OAuth connect button, title/description form, upload progress.
 */

import React, { useState, useCallback } from 'react';
import { useYouTubeStore } from '@/stores/useYouTubeStore';
import { authenticate, disconnect, uploadVideo } from '@/lib/youtubeApi';

interface DJYouTubeUploadProps {
  videoBlob: Blob | null;
  defaultTitle?: string;
  defaultDescription?: string;
  onClose: () => void;
}

export const DJYouTubeUpload: React.FC<DJYouTubeUploadProps> = ({
  videoBlob,
  defaultTitle = 'DJ Set',
  defaultDescription = '',
  onClose,
}) => {
  const isAuthenticated = useYouTubeStore(s => s.isAuthenticated);
  const channelName = useYouTubeStore(s => s.channelName);
  const uploading = useYouTubeStore(s => s.uploading);
  const uploadProgress = useYouTubeStore(s => s.uploadProgress);
  const lastVideoUrl = useYouTubeStore(s => s.lastVideoUrl);
  const error = useYouTubeStore(s => s.error);

  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription);
  const [privacy, setPrivacy] = useState<'public' | 'unlisted' | 'private'>('unlisted');

  const handleAuth = useCallback(async () => {
    try {
      await authenticate();
    } catch (err) {
      useYouTubeStore.getState().setError((err as Error).message);
    }
  }, []);

  const handleUpload = useCallback(async () => {
    if (!videoBlob) return;
    try {
      await uploadVideo(videoBlob, {
        title,
        description,
        privacy,
        tags: ['DJ set', 'chiptune', 'tracker music', 'DEViLBOX', 'live mix'],
      });
    } catch (err) {
      console.error('[DJYouTubeUpload] Upload failed:', err);
    }
  }, [videoBlob, title, description, privacy]);

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-dark-bgSecondary border border-dark-border rounded-lg shadow-2xl w-[420px] max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
          <h3 className="text-sm font-bold text-text-primary">Upload to YouTube</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary text-lg">x</button>
        </div>

        <div className="p-4 space-y-4">
          {/* Auth section */}
          {!isAuthenticated ? (
            <div className="text-center space-y-3">
              <p className="text-xs text-text-muted">Connect your YouTube account to upload videos directly.</p>
              <button
                onClick={handleAuth}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-bold transition-colors"
              >
                Connect YouTube
              </button>
              {error && <p className="text-xs text-red-400">{error}</p>}
            </div>
          ) : (
            <>
              {/* Connected info */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-green-400">Connected: {channelName || 'YouTube'}</span>
                <button onClick={disconnect} className="text-text-muted hover:text-red-400 underline">Disconnect</button>
              </div>

              {!videoBlob ? (
                <p className="text-xs text-text-muted text-center py-4">
                  No video to upload. Record a video first using the VIDEO button.
                </p>
              ) : lastVideoUrl ? (
                /* Upload complete */
                <div className="text-center space-y-3 py-4">
                  <p className="text-green-400 text-sm font-bold">Upload complete!</p>
                  <a
                    href={lastVideoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-primary hover:underline text-sm"
                  >
                    View on YouTube
                  </a>
                </div>
              ) : (
                /* Upload form */
                <>
                  <div>
                    <label className="text-[10px] text-text-muted uppercase">Title</label>
                    <input
                      type="text"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      className="w-full mt-1 px-2 py-1.5 bg-dark-bg border border-dark-border rounded text-sm text-text-primary focus:outline-none focus:border-accent-primary"
                      maxLength={100}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-text-muted uppercase">Description</label>
                    <textarea
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      rows={3}
                      className="w-full mt-1 px-2 py-1.5 bg-dark-bg border border-dark-border rounded text-sm text-text-primary focus:outline-none focus:border-accent-primary resize-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-text-muted uppercase">Privacy</label>
                    <select
                      value={privacy}
                      onChange={e => setPrivacy(e.target.value as 'public' | 'unlisted' | 'private')}
                      className="w-full mt-1 px-2 py-1.5 bg-dark-bg border border-dark-border rounded text-sm text-text-primary"
                    >
                      <option value="unlisted">Unlisted</option>
                      <option value="public">Public</option>
                      <option value="private">Private</option>
                    </select>
                  </div>

                  <div className="text-xs text-text-muted">
                    Video: {(videoBlob.size / 1024 / 1024).toFixed(1)}MB ({videoBlob.type})
                  </div>

                  {uploading ? (
                    <div className="space-y-2">
                      <div className="w-full h-2 bg-dark-bg rounded overflow-hidden">
                        <div
                          className="h-full bg-red-600 transition-all"
                          style={{ width: `${uploadProgress * 100}%` }}
                        />
                      </div>
                      <p className="text-xs text-text-muted text-center">
                        Uploading... {Math.round(uploadProgress * 100)}%
                      </p>
                    </div>
                  ) : (
                    <button
                      onClick={handleUpload}
                      className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-bold transition-colors"
                    >
                      Upload to YouTube
                    </button>
                  )}

                  {error && <p className="text-xs text-red-400">{error}</p>}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
