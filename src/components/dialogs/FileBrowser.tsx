/**
 * FileBrowser - Unified file browser for DEViLBOX
 * Combines:
 * - File System Access API (direct filesystem access in Chrome/Edge)
 * - Electron IPC (native OS filesystem access)
 * - Server API (jailed to data/ directory)
 */

import React, { useState } from 'react';
import { X, Folder, FolderOpen, FileAudio, ArrowLeft, Trash2, File, Cloud, HardDrive, History, RotateCcw, Globe } from 'lucide-react';
import '@cubone/react-file-manager/dist/style.css';
import { hasElectronFS } from '@utils/electron';
import { useFileNavigation, isTrackerModule, type FileSource } from './useFileNavigation';
import { ModlandPanel, HVSCPanel } from './FilePreviewPanel';

interface FileBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onLoad: (data: object, filename: string) => void;
  onLoadTrackerModule?: (buffer: ArrayBuffer, filename: string) => Promise<void>;
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
  const [fileSource, setFileSource] = useState<FileSource>('demo');

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
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl w-[800px] max-w-[90vw] h-[600px] max-h-[80vh] flex flex-col"
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
              setSelectedFile(null);
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
          {user && isServerAvailable && (
            <button
              onClick={() => {
                setFileSource('cloud');
                setSelectedFile(null);
                setCurrentPath('');
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

          {/* Modland Tab - only in load mode */}
          {mode === 'load' && onLoadTrackerModule && (
            <button
              onClick={() => {
                setFileSource('modland');
                setSelectedFile(null);
              }}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                fileSource === 'modland'
                  ? 'text-green-400 border-b-2 border-green-400 bg-dark-bgSecondary'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <Globe size={14} />
              Modland
            </button>
          )}

          {/* HVSC Tab - only in load mode */}
          {mode === 'load' && onLoadTrackerModule && (
            <button
              onClick={() => {
                setFileSource('hvsc');
                setSelectedFile(null);
                setHvscQuery('');
              }}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                fileSource === 'hvsc'
                  ? 'text-blue-400 border-b-2 border-blue-400 bg-dark-bgSecondary'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <FileAudio size={14} />
              HVSC
            </button>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Browse Files button - opens native file picker */}
          {mode === 'load' && (
            <button
              onClick={handleBrowseFiles}
              className="px-4 py-2 text-sm font-medium text-text-muted hover:text-text-primary transition-colors"
            >
              Browse Files...
            </button>
          )}
          
          {/* Open Folder button (when Web FS API available) */}
          {!hasElectronFS() && fileSource === 'demo' && (
            <button
              onClick={handleRequestFilesystemAccess}
              className="px-4 py-2 text-sm font-medium text-text-muted hover:text-text-primary transition-colors"
            >
              {hasFilesystemAccess ? 'Filesystem' : 'Open Folder...'}
            </button>
          )}
        </div>

        {/* Breadcrumb / Current Path */}
        {currentPath && fileSource === 'demo' && (
          <div className="flex-shrink-0 px-4 py-2 bg-dark-bgTertiary border-b border-dark-border">
            <div className="flex items-center gap-1.5 text-xs text-text-muted font-mono truncate">
              <FolderOpen size={14} /> {currentPath}
            </div>
          </div>
        )}

        {/* Cloud Files Info */}
        {fileSource === 'cloud' && user && (
          <div className="flex-shrink-0 px-4 py-2 bg-accent-primary/10 border-b border-dark-border">
            <div className="flex items-center gap-1.5 text-xs text-accent-primary">
              <Cloud size={14} /> Your saved files ({cloudFiles.length})
            </div>
          </div>
        )}

        {/* Modland search bar */}
        {fileSource === 'modland' && (
          <div className="flex-shrink-0 px-4 py-2 bg-dark-bgTertiary border-b border-dark-border flex gap-2 items-center">
            <div className="flex items-center gap-2 text-xs text-text-muted font-mono">
              {modlandStatus?.status === 'ready' && (
                <span>{modlandStatus.totalFiles.toLocaleString()} files</span>
              )}
              {modlandStatus?.status === 'indexing' && (
                <span className="text-amber-400 flex items-center gap-1">
                  <Loader2 size={10} className="animate-spin" /> Indexing...
                </span>
              )}
            </div>
            <div className="flex-1 relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                ref={modlandSearchRef}
                value={modlandQuery}
                onChange={(e) => setModlandQuery(e.target.value)}
                placeholder="Search modules..."
                className="w-full pl-7 pr-2 py-1.5 text-xs font-mono bg-dark-bg border border-dark-borderLight
                           rounded text-text-primary placeholder:text-text-muted/40
                           focus:border-green-600 focus:outline-none transition-colors"
              />
            </div>
            <select
              value={modlandFormat}
              onChange={(e) => setModlandFormat(e.target.value)}
              className="px-2 py-1.5 text-[11px] font-mono bg-dark-bg border border-dark-borderLight
                         rounded text-text-secondary cursor-pointer hover:bg-dark-bgHover transition-colors"
            >
              <option value="">All formats</option>
              {modlandFormats.map((f) => (
                <option key={f.format} value={f.format}>
                  {f.format} ({f.count.toLocaleString()})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* HVSC search/browse bar */}
        {fileSource === 'hvsc' && (
          <div className="flex-shrink-0 px-4 py-2 bg-dark-bgTertiary border-b border-dark-border flex gap-2 items-center">
            <div className="flex items-center gap-2 text-xs text-text-muted font-mono">
              <FileAudio size={12} />
              <span>80K+ SID tunes</span>
            </div>
            <div className="flex-1 relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                ref={hvscSearchRef}
                value={hvscQuery}
                onChange={(e) => setHvscQuery(e.target.value)}
                placeholder="Search composers, songs..."
                className="w-full pl-7 pr-2 py-1.5 text-xs font-mono bg-dark-bg border border-dark-borderLight
                           rounded text-text-primary placeholder:text-text-muted/40
                           focus:border-blue-600 focus:outline-none transition-colors"
              />
            </div>
            {hvscPath && (
              <div className="text-xs text-text-muted font-mono truncate max-w-[200px]">
                {hvscPath}
              </div>
            )}
          </div>
        )}

        {/* File List */}
        <div ref={fileListRef} className="flex-1 min-h-0 overflow-auto p-4">
          {error && (
            <div className="bg-red-900/30 border border-red-500 text-red-300 px-4 py-2 rounded mb-4 select-text">
              {error}
            </div>
          )}

          {/* Modland results */}
          {fileSource === 'modland' ? (
            <div className="flex flex-col gap-1">
              {modlandError && (
                <div className="flex items-center gap-1.5 text-red-400 text-xs font-mono px-3 py-2 mb-2 bg-red-900/20 rounded border border-red-900/30">
                  <AlertCircle size={12} />
                  {modlandError}
                </div>
              )}

              {modlandResults.length === 0 && !modlandLoading ? (
                <div className="flex flex-col items-center justify-center py-16 text-text-muted">
                  <Globe size={32} className="mb-3 opacity-40" />
                  <p className="text-sm font-mono">
                    {modlandQuery || modlandFormat ? 'No results found' : 'Search the modland archive'}
                  </p>
                  <p className="text-xs text-text-muted/60 mt-1">
                    165K+ tracker modules from ftp.modland.com
                  </p>
                </div>
              ) : (
                <>
                  {modlandResults.map((file) => (
                    <div
                      key={file.full_path}
                      className="flex items-center gap-3 px-3 py-2 bg-dark-bgTertiary rounded border border-transparent
                                 hover:bg-dark-bgHover hover:border-dark-border transition-colors group"
                    >
                      <FileAudio size={16} className="text-text-muted flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-text-primary text-sm font-mono truncate">
                          {file.filename}
                        </div>
                        <div className="flex gap-3 text-xs text-text-muted">
                          <span className="text-green-400/70">{file.format}</span>
                          <span>{file.author}</span>
                        </div>
                      </div>

                      {modlandDownloading.has(file.full_path) ? (
                        <Loader2 size={14} className="animate-spin text-green-400 flex-shrink-0" />
                      ) : (
                        <button
                          onClick={() => handleModlandLoad(file)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded
                                     bg-green-900/30 text-green-400 border border-green-800/50
                                     hover:bg-green-800/40 hover:text-green-300 transition-colors
                                     opacity-0 group-hover:opacity-100 flex-shrink-0"
                        >
                          <Download size={12} />
                          Load
                        </button>
                      )}
                    </div>
                  ))}

                  {modlandHasMore && (
                    <button
                      onClick={modlandLoadMore}
                      disabled={modlandLoading}
                      className="mt-2 py-2 text-xs font-mono text-text-secondary bg-dark-bgTertiary
                                 border border-dark-borderLight rounded hover:bg-dark-bgHover
                                 hover:text-text-primary transition-colors disabled:opacity-50"
                    >
                      {modlandLoading ? (
                        <span className="flex items-center justify-center gap-1">
                          <Loader2 size={12} className="animate-spin" /> Loading...
                        </span>
                      ) : (
                        'Load more results'
                      )}
                    </button>
                  )}
                </>
              )}

              {modlandLoading && modlandResults.length === 0 && (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={20} className="animate-spin text-green-400" />
                </div>
              )}
            </div>
          ) : fileSource === 'hvsc' ? (
            <div className="flex flex-col gap-1">
              {hvscError && (
                <div className="flex items-center gap-1.5 text-red-400 text-xs font-mono px-3 py-2 mb-2 bg-red-900/20 rounded border border-red-900/30">
                  <AlertCircle size={12} />
                  {hvscError}
                </div>
              )}

              {/* Show search results if searching, otherwise show browse entries */}
              {hvscQuery ? (
                // Search results
                hvscSearchResults.length === 0 && !hvscLoading ? (
                  <div className="flex flex-col items-center justify-center py-16 text-text-muted">
                    <FileAudio size={32} className="mb-3 opacity-40" />
                    <p className="text-sm font-mono">No results found</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {hvscSearchResults.map((entry) => (
                      <div
                        key={entry.path}
                        className="flex items-center gap-3 px-3 py-2 bg-dark-bgTertiary rounded border border-transparent
                                   hover:bg-dark-bgHover hover:border-dark-border transition-colors group cursor-pointer"
                        onClick={() => entry.isDirectory ? browseHVSCDirectory(entry.path) : handleHVSCLoad(entry)}
                      >
                        {entry.isDirectory ? (
                          <Folder size={16} className="text-blue-400 flex-shrink-0" />
                        ) : (
                          <FileAudio size={16} className="text-text-muted flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-text-primary text-sm font-mono truncate">
                            {entry.name}
                          </div>
                          <div className="text-xs text-text-muted truncate">
                            {entry.path}
                          </div>
                        </div>

                        {!entry.isDirectory && (
                          hvscDownloading.has(entry.path) ? (
                            <Loader2 size={14} className="animate-spin text-blue-400 flex-shrink-0" />
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleHVSCLoad(entry);
                              }}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded
                                         bg-blue-900/30 text-blue-400 border border-blue-800/50
                                         hover:bg-blue-800/40 hover:text-blue-300 transition-colors
                                         opacity-0 group-hover:opacity-100 flex-shrink-0"
                            >
                              <Download size={12} />
                              Load
                            </button>
                          )
                        )}
                      </div>
                    ))}
                  </div>
                )
              ) : (
                // Browse mode (featured or directory)
                hvscEntries.length === 0 && !hvscLoading ? (
                  <div className="flex flex-col items-center justify-center py-16 text-text-muted">
                    <FileAudio size={32} className="mb-3 opacity-40" />
                    <p className="text-sm font-mono">Browse the HVSC collection</p>
                    <p className="text-xs text-text-muted/60 mt-1">
                      80K+ C64 SID tunes
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {/* Back button for directories */}
                    {hvscPath && (
                      <div
                        className="flex items-center gap-3 px-3 py-2 bg-dark-bgTertiary/50 rounded border border-dark-borderLight
                                   hover:bg-dark-bgHover hover:border-dark-border transition-colors cursor-pointer"
                        onClick={() => {
                          const parentPath = hvscPath.split('/').slice(0, -1).join('/');
                          browseHVSCDirectory(parentPath);
                        }}
                      >
                        <ArrowLeft size={16} className="text-text-muted" />
                        <span className="text-text-secondary text-sm font-mono">..(back)</span>
                      </div>
                    )}

                    {hvscEntries.map((entry) => (
                      <div
                        key={entry.path}
                        className="flex items-center gap-3 px-3 py-2 bg-dark-bgTertiary rounded border border-transparent
                                   hover:bg-dark-bgHover hover:border-dark-border transition-colors group cursor-pointer"
                        onClick={() => handleHVSCDirectoryClick(entry)}
                      >
                        {entry.isDirectory ? (
                          <Folder size={16} className="text-blue-400 flex-shrink-0" />
                        ) : (
                          <FileAudio size={16} className="text-text-muted flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-text-primary text-sm font-mono truncate">
                            {entry.name}
                          </div>
                          {entry.size && (
                            <div className="text-xs text-text-muted">
                              {(entry.size / 1024).toFixed(1)} KB
                            </div>
                          )}
                        </div>

                        {!entry.isDirectory && (
                          hvscDownloading.has(entry.path) ? (
                            <Loader2 size={14} className="animate-spin text-blue-400 flex-shrink-0" />
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleHVSCLoad(entry);
                              }}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded
                                         bg-blue-900/30 text-blue-400 border border-blue-800/50
                                         hover:bg-blue-800/40 hover:text-blue-300 transition-colors
                                         opacity-0 group-hover:opacity-100 flex-shrink-0"
                            >
                              <Download size={12} />
                              Load
                            </button>
                          )
                        )}
                      </div>
                    ))}
                  </div>
                )
              )}

              {hvscLoading && (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={20} className="animate-spin text-blue-400" />
                </div>
              )}
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-16 text-text-muted">
              Loading...
            </div>
          ) : fileSource === 'cloud' && !user ? (
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
          ) : files.length === 0 ? (
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
                  {!hasElectronFS() && !hasServerFS && !hasFilesystemAccess && (
                    <button
                      onClick={handleRequestFilesystemAccess}
                      className="px-4 py-2 bg-accent-primary text-white rounded hover:bg-accent-hover"
                    >
                      Open Folder
                    </button>
                  )}
                </>
              )}
              {hasElectronFS() && !electronDirectory && fileSource === 'demo' && (
                <button
                  onClick={async () => {
                    if (window.electron?.fs) {
                      const dir = await window.electron.fs.openDirectory();
                      if (dir) {
                        setElectronDirectory(dir);
                        setCurrentPath(dir);
                        loadFiles();
                      }
                    }
                  }}
                  className="px-4 py-2 bg-accent-primary text-white rounded hover:bg-accent-hover"
                >
                  Select Folder
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {/* Back button when in subdirectory (not for cloud files) */}
              {currentPath !== '' && fileSource === 'demo' && (
                <div
                  onClick={() => {
                    if (hasElectronFS() && currentPath) {
                      // Navigate to parent directory in Electron
                      const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
                      setCurrentPath(parentPath);
                      setElectronDirectory(parentPath);
                    } else if (currentPath) {
                      // Navigate to parent directory (server or manifest)
                      const parentPath = currentPath.split('/').slice(0, -1).join('/') || '';
                      setCurrentPath(parentPath);
                    }
                    setSelectedFile(null);
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
              {files.map((file) => (
                <div
                  key={file.id}
                  data-file-row
                  onClick={() => {
                    // Directories: open on single tap (standard file browser behavior)
                    if (file.isDirectory) {
                      if (hasElectronFS()) {
                        setCurrentPath(file.path);
                        setElectronDirectory(file.path);
                      } else {
                        setCurrentPath(file.path);
                      }
                      setSelectedFile(null);
                      return;
                    }

                    // Files: select on single tap, load on double tap
                    const now = Date.now();
                    const isDoubleTap = lastClickRef.current.id === file.id && (now - lastClickRef.current.time) < 500;
                    
                    if (isDoubleTap) {
                      // Double tap on file: load it
                      setSelectedFile(file);
                      if (mode === 'load') handleLoad();
                      // Reset to prevent triple-tap
                      lastClickRef.current = { id: '', time: 0 };
                      return;
                    }

                    // Single tap on file: select it
                    lastClickRef.current = { id: file.id, time: now };
                    setSelectedFile(file);
                  }}
                  className={`flex items-center gap-3 p-3 rounded cursor-pointer transition-colors ${
                    selectedFile?.id === file.id
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
                        loadRevisions(file.cloudId!, file.name);
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
                      handleDelete(file);
                    }}
                    className="text-text-muted hover:text-red-400 p-1"
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

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center gap-4 px-4 py-3 border-t border-dark-border">
          {mode === 'save' && fileSource !== 'modland' && (
            <input
              type="text"
              value={saveFilename}
              onChange={(e) => setSaveFilename(e.target.value)}
              placeholder="Filename"
              className="flex-1 px-3 py-2 bg-dark-bgTertiary border border-dark-border rounded text-text-primary"
            />
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-2 text-text-muted hover:text-text-primary"
          >
            {(fileSource === 'modland' || fileSource === 'hvsc') ? 'Close' : 'Cancel'}
          </button>
          {fileSource !== 'modland' && fileSource !== 'hvsc' && (
            <button
              onClick={mode === 'load' ? handleLoad : handleSave}
              disabled={mode === 'load' && (!selectedFile || selectedFile.isDirectory)}
              className={`flex items-center gap-2 px-6 py-2 rounded font-medium ${
                (mode === 'load' && (!selectedFile || selectedFile.isDirectory))
                  ? 'bg-dark-bgTertiary text-text-muted cursor-not-allowed'
                  : 'bg-accent-primary text-white hover:bg-accent-primaryHover'
              }`}
            >
              {fileSource === 'cloud' && <Cloud size={16} />}
              {mode === 'load' ? 'Load' : (fileSource === 'cloud' ? 'Save to Cloud' : 'Save')}
            </button>
          )}
        </div>
      </div>

      {/* Version History Modal */}
      {showRevisions && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60]">
          <div className="bg-dark-bgPrimary border border-dark-border rounded-lg w-[400px] h-[500px] max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-dark-border">
              <div className="flex items-center gap-2">
                <History size={18} className="text-accent-primary" />
                <span className="font-semibold text-text-primary">Version History</span>
              </div>
              <button
                onClick={() => {
                  setShowRevisions(false);
                  setRevisions([]);
                  setRevisionsFileId(null);
                }}
                className="text-text-muted hover:text-text-primary"
              >
                <X size={18} />
              </button>
            </div>

            {/* File info */}
            <div className="flex-shrink-0 px-4 py-2 bg-dark-bgSecondary border-b border-dark-border">
              <span className="text-sm text-text-muted">File: </span>
              <span className="text-sm text-text-primary font-medium">{revisionsFilename}</span>
            </div>

            {/* Revision list */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              {revisionsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin w-6 h-6 border-2 border-accent-primary border-t-transparent rounded-full" />
                </div>
              ) : revisions.length === 0 ? (
                <div className="text-center py-8 text-text-muted">
                  No previous versions available.
                  <br />
                  <span className="text-sm">Versions are saved when you update a file.</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {revisions.map((rev) => (
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
                        onClick={() => handleRestoreRevision(rev.revisionNumber)}
                        disabled={revisionsLoading}
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
