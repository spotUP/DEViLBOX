/**
 * FileBrowser - Unified file browser for DEViLBOX
 * Combines:
 * - File System Access API (direct filesystem access in Chrome/Edge)
 * - Electron IPC (native OS filesystem access)
 * - Server API (jailed to data/ directory)
 */

import React, { useState, useRef, useEffect } from 'react';
import { X, Folder, FolderOpen, FileAudio, ArrowLeft, Trash2, File, Cloud, HardDrive, History, RotateCcw, Globe } from 'lucide-react';
import '@cubone/react-file-manager/dist/style.css';
import { hasElectronFS } from '@utils/electron';
import { useFileNavigation, isTrackerModule, type FileSource, getLastFileSource, setLastFileSource } from './useFileNavigation';
import { OnlinePanel } from './FilePreviewPanel';
import { useModalClose } from '@hooks/useDialogKeyboard';

interface FileBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onLoad: (data: object, filename: string) => void;
  onLoadTrackerModule?: (buffer: ArrayBuffer, filename: string, companionFiles?: Map<string, ArrayBuffer>) => Promise<void>;
  onSave?: (getData: () => object) => void;
  mode?: 'load' | 'save';
  currentProjectData?: () => object;
  suggestedFilename?: string;
}

export const FileBrowser: React.FC<FileBrowserProps> = ({
  isOpen,
  onClose,
  onLoad,
  onLoadTrackerModule,
  mode,
  currentProjectData,
  suggestedFilename = 'untitled.dbx',
}) => {
  useModalClose({ isOpen, onClose });
  const [fileSource, _setFileSource] = useState<FileSource>(getLastFileSource);
  const setFileSource = (s: FileSource) => { setLastFileSource(s); _setFileSource(s); };
  const modalRef = useRef<HTMLDivElement>(null);

  // Protect text inputs inside the modal from being intercepted by global
  // keyboard handlers. In WebGL mode the modal renders in a portal outside
  // the React root, so capture-phase listeners on `window` may eat keystrokes
  // before the browser's default input handling. Registering our own capture
  // handler on the modal container lets us stopPropagation early.
  useEffect(() => {
    const el = modalRef.current;
    if (!el || !isOpen) return;
    const guard = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) {
        // Allow Escape to still close the modal
        if (e.key === 'Escape') return;
        e.stopPropagation();
      }
    };
    el.addEventListener('keydown', guard, { capture: true });
    return () => el.removeEventListener('keydown', guard, { capture: true });
  }, [isOpen]);

  const nav = useFileNavigation({
    isOpen,
    fileSource,
    onLoad,
    onLoadTrackerModule,
    onClose,
    currentProjectData,
    mode,
    suggestedFilename,
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[99990]" onClick={onClose}>
      <div
        ref={modalRef}
        className="bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl w-full max-w-[90vw] md:max-w-[800px] h-[90vh] md:h-[600px] max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-dark-border">
          <h2 className="text-lg font-bold text-text-primary">
            {mode === 'load' ? 'Load Module' : 'Save Module'}
          </h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* View Mode Tabs */}
        <div className="flex-shrink-0 flex border-b border-dark-border bg-dark-bgTertiary">
          {/* Demo Files Tab */}
          <button
            onClick={() => {
              setFileSource('demo');
              nav.setSelectedFile(null);
            }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
              fileSource === 'demo'
                ? 'text-accent-primary border-b-2 border-accent-primary bg-dark-bgSecondary'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <HardDrive size={14} />
            Demo Files
          </button>

          {/* Cloud Files Tab - only shown when logged in */}
          {nav.user && nav.isServerAvailable && (
            <button
              onClick={() => {
                setFileSource('cloud');
                nav.setSelectedFile(null);
                nav.setCurrentPath('');
              }}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                fileSource === 'cloud'
                  ? 'text-accent-primary border-b-2 border-accent-primary bg-dark-bgSecondary'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <Cloud size={14} />
              My Files
            </button>
          )}

          {/* Online Tab — unified Modland + HVSC (only in load mode) */}
          {mode === 'load' && onLoadTrackerModule && (
            <button
              onClick={() => {
                setFileSource('online');
                nav.setSelectedFile(null);
              }}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                fileSource === 'online'
                  ? 'text-accent-primary border-b-2 border-accent-primary bg-dark-bgSecondary'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <Globe size={14} />
              Online
            </button>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Browse Files button - opens native file picker */}
          {mode === 'load' && (
            <button
              onClick={nav.handleBrowseFiles}
              className="px-4 py-2 text-sm font-medium text-text-muted hover:text-text-primary transition-colors"
            >
              Browse Files...
            </button>
          )}
          
          {/* Open Folder button (when Web FS API available) */}
          {!hasElectronFS() && fileSource === 'demo' && (
            <button
              onClick={nav.handleRequestFilesystemAccess}
              className="px-4 py-2 text-sm font-medium text-text-muted hover:text-text-primary transition-colors"
            >
              {nav.hasFilesystemAccess ? 'Filesystem' : 'Open Folder...'}
            </button>
          )}
        </div>

        {/* Online panel renders its own toolbar + content */}
        {fileSource === 'online' ? (
          <OnlinePanel isOpen={isOpen} onLoadTrackerModule={onLoadTrackerModule} onClose={onClose} />
        ) : (
          <>
            {/* Breadcrumb / Current Path */}
            {nav.currentPath && fileSource === 'demo' && (
              <div className="flex-shrink-0 px-4 py-2 bg-dark-bgTertiary border-b border-dark-border">
                <div className="flex items-center gap-1.5 text-xs text-text-muted font-mono truncate">
                  <FolderOpen size={14} /> {nav.currentPath}
                </div>
              </div>
            )}

            {/* Cloud Files Info */}
            {fileSource === 'cloud' && nav.user && (
              <div className="flex-shrink-0 px-4 py-2 bg-accent-primary/10 border-b border-dark-border">
                <div className="flex items-center gap-1.5 text-xs text-accent-primary">
                  <Cloud size={14} /> Your saved files ({nav.cloudFiles.length})
                </div>
              </div>
            )}

            {/* File List */}
            <div ref={nav.fileListRef} className="flex-1 min-h-0 overflow-auto p-4">
              {nav.error && (
                <div className="bg-accent-error/10 border border-accent-error/50 text-accent-error px-4 py-2 rounded mb-4 select-text">
                  {nav.error}
                </div>
              )}

              {nav.isLoading ? (
                <div className="flex items-center justify-center py-16 text-text-muted">
                  Loading...
                </div>
              ) : fileSource === 'cloud' && !nav.user ? (
                // Cloud mode but not logged in
                <div className="flex flex-col items-center justify-center py-16 text-text-muted">
                  <Cloud size={48} className="mb-4 text-text-muted/50" />
                  <p className="mb-2 text-lg font-medium">Sign in to save files</p>
                  <p className="mb-4 text-sm text-center max-w-md">
                    Create a free account to save your songs to the cloud and access them from any device.
                  </p>
                  <button
                    onClick={() => setFileSource('demo')}
                    className="px-4 py-2 text-text-muted hover:text-text-primary"
                  >
                    View Demo Files Instead
                  </button>
                </div>
              ) : nav.files.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-text-muted">
                  {fileSource === 'cloud' ? (
                    <>
                      <Cloud size={48} className="mb-4 text-text-muted/50" />
                      <p className="mb-2">No saved files yet</p>
                      <p className="text-sm text-center max-w-md">
                        {mode === 'save' 
                          ? 'Enter a filename below and click Save to save your first file.'
                          : 'Save a project first to see it here.'}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="mb-4">No files found</p>
                      {!hasElectronFS() && !nav.hasServerFS && !nav.hasFilesystemAccess && (
                        <button
                          onClick={nav.handleRequestFilesystemAccess}
                          className="px-4 py-2 bg-accent-primary text-text-primary rounded hover:bg-accent-hover"
                        >
                          Open Folder
                        </button>
                      )}
                    </>
                  )}
                  {hasElectronFS() && !nav.electronDirectory && fileSource === 'demo' && (
                    <button
                      onClick={async () => {
                        if (window.electron?.fs) {
                          const dir = await window.electron.fs.openDirectory();
                          if (dir) {
                            nav.setElectronDirectory(dir);
                            nav.setCurrentPath(dir);
                            nav.loadFiles();
                          }
                        }
                      }}
                      className="px-4 py-2 bg-accent-primary text-text-primary rounded hover:bg-accent-hover"
                    >
                      Select Folder
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {/* Back button when in subdirectory (not for cloud files) */}
                  {nav.currentPath !== '' && fileSource === 'demo' && (
                    <div
                      onClick={() => {
                        if (hasElectronFS() && nav.currentPath) {
                          const parentPath = nav.currentPath.split('/').slice(0, -1).join('/') || '/';
                          nav.setCurrentPath(parentPath);
                          nav.setElectronDirectory(parentPath);
                        } else if (nav.currentPath) {
                          const parentPath = nav.currentPath.split('/').slice(0, -1).join('/') || '';
                          nav.setCurrentPath(parentPath);
                        }
                        nav.setSelectedFile(null);
                      }}
                      data-file-row
                      className="flex items-center gap-3 p-3 rounded cursor-pointer transition-colors bg-dark-bgSecondary hover:bg-dark-bgHover border border-dark-border"
                    >
                      <ArrowLeft size={18} className="text-text-muted" />
                      <div className="flex-1">
                        <div className="font-medium text-text-primary">.. (back)</div>
                      </div>
                    </div>
                  )}
                  {nav.files.map((file) => (
                    <div
                      key={file.id}
                      data-file-row
                      onClick={() => {
                        // Directories: open on single click
                        if (file.isDirectory) {
                          if (hasElectronFS()) {
                            nav.setCurrentPath(file.path);
                            nav.setElectronDirectory(file.path);
                          } else {
                            nav.setCurrentPath(file.path);
                          }
                          nav.setSelectedFile(null);
                          return;
                        }
                        // Files: select on single click
                        nav.setSelectedFile(file);
                      }}
                      onDoubleClick={() => {
                        if (file.isDirectory) return;
                        nav.setSelectedFile(file);
                        if (mode === 'load') nav.handleLoad();
                      }}
                      className={`flex items-center gap-3 p-3 rounded cursor-pointer transition-colors ${
                        nav.selectedFile?.id === file.id
                          ? 'bg-accent-primary/20 border border-accent-primary'
                          : 'bg-dark-bgTertiary hover:bg-dark-bgHover border border-transparent'
                      }`}
                    >
                      <div className="text-text-muted flex-shrink-0">
                        {file.isDirectory
                          ? <Folder size={18} />
                          : isTrackerModule(file.name)
                            ? <FileAudio size={18} />
                            : <File size={18} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-text-primary truncate">{file.name}</div>
                        <div className="text-xs text-text-muted">
                          {file.size ? `${(file.size / 1024).toFixed(1)} KB` : ''}
                          {file.modifiedAt && ` • ${file.modifiedAt.toLocaleDateString()}`}
                        </div>
                      </div>
                      {/* Version history button for cloud files */}
                      {file.source === 'cloud' && file.cloudId && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            nav.loadRevisions(file.cloudId!, file.name);
                          }}
                          className="text-text-muted hover:text-accent-primary p-1"
                          title="Version History"
                          aria-label="Version History"
                        >
                          <History size={14} />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          nav.handleDelete(file);
                        }}
                        className="text-text-muted hover:text-accent-error p-1"
                        title="Delete"
                        aria-label="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center gap-4 px-4 py-3 border-t border-dark-border">
          {mode === 'save' && fileSource !== 'online' && (
            <input
              type="text"
              value={nav.saveFilename}
              onChange={(e) => nav.setSaveFilename(e.target.value)}
              placeholder="Filename"
              className="flex-1 px-3 py-2 bg-dark-bgTertiary border border-dark-border rounded text-text-primary"
            />
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-2 text-text-muted hover:text-text-primary"
          >
            {fileSource === 'online' ? 'Close' : 'Cancel'}
          </button>
          {fileSource !== 'online' && (
            <button
              onClick={mode === 'load' ? nav.handleLoad : nav.handleSave}
              disabled={mode === 'load' && (!nav.selectedFile || nav.selectedFile.isDirectory)}
              className={`flex items-center gap-2 px-6 py-2 rounded font-medium ${
                (mode === 'load' && (!nav.selectedFile || nav.selectedFile.isDirectory))
                  ? 'bg-dark-bgTertiary text-text-muted cursor-not-allowed'
                  : 'bg-accent-primary text-text-primary hover:bg-accent-primaryHover'
              }`}
            >
              {fileSource === 'cloud' && <Cloud size={16} />}
              {mode === 'load' ? 'Load' : (fileSource === 'cloud' ? 'Save to Cloud' : 'Save')}
            </button>
          )}
        </div>
      </div>

      {/* Version History Modal */}
      {nav.showRevisions && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60]">
          <div className="bg-dark-bgPrimary border border-dark-border rounded-lg w-full max-w-[90vw] md:max-w-[400px] h-[500px] overflow-hidden max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-dark-border">
              <div className="flex items-center gap-2">
                <History size={18} className="text-accent-primary" />
                <span className="font-semibold text-text-primary">Version History</span>
              </div>
              <button
                onClick={nav.closeRevisions}
                className="text-text-muted hover:text-text-primary"
              >
                <X size={18} />
              </button>
            </div>

            {/* File info */}
            <div className="flex-shrink-0 px-4 py-2 bg-dark-bgSecondary border-b border-dark-border">
              <span className="text-sm text-text-muted">File: </span>
              <span className="text-sm text-text-primary font-medium">{nav.revisionsFilename}</span>
            </div>

            {/* Revision list */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              {nav.revisionsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin w-6 h-6 border-2 border-accent-primary border-t-transparent rounded-full" />
                </div>
              ) : nav.revisions.length === 0 ? (
                <div className="text-center py-8 text-text-muted">
                  No previous versions available.
                  <br />
                  <span className="text-sm">Versions are saved when you update a file.</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {nav.revisions.map((rev) => (
                    <div
                      key={rev.id}
                      className="flex items-center justify-between p-3 bg-dark-bgTertiary rounded border border-dark-border"
                    >
                      <div>
                        <div className="text-text-primary font-medium">
                          Version {rev.revisionNumber}
                        </div>
                        <div className="text-xs text-text-muted">
                          {new Date(rev.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <button
                        onClick={() => nav.handleRestoreRevision(rev.revisionNumber)}
                        disabled={nav.revisionsLoading}
                        className="flex items-center gap-1 px-3 py-1.5 bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30 rounded text-sm font-medium disabled:opacity-50"
                      >
                        <RotateCcw size={14} />
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-dark-border text-xs text-text-muted">
              Up to 10 versions are kept. Restoring creates a backup of the current version.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileBrowser;
