/**
 * SIDTagsTab — DOM tag management panel for the SID info modal.
 * Browse, add, remove, and create tags for a SID file.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { X, Plus, Search, Tag, Loader2 } from 'lucide-react';
import { fetchAllTags, fetchFileTags, addTagToFile, removeTagFromFile, createTag } from '@/lib/sid/composerApi';
import type { TagInfo } from '@/lib/sid/composerApi';

interface SIDTagsTabProps {
  className?: string;
  fileId: number | null;
}

const TAG_COLORS: Record<string, string> = {
  music: 'bg-purple-900/50 text-purple-300 border-purple-700',
  collection: 'bg-green-900/50 text-green-300 border-green-700',
};
const DEFAULT_TAG_COLOR = 'bg-dark-bgTertiary text-text-muted border-dark-border';

function tagColor(type: string) {
  return TAG_COLORS[type] ?? DEFAULT_TAG_COLOR;
}

export const SIDTagsTab: React.FC<SIDTagsTabProps> = ({ className, fileId }) => {
  const [allTags, setAllTags] = useState<TagInfo[]>([]);
  const [fileTags, setFileTags] = useState<TagInfo[]>([]);
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  // Load tags on mount / fileId change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchAllTags(), fileId != null ? fetchFileTags(fileId) : Promise.resolve([] as TagInfo[])])
      .then(([all, file]) => { if (!cancelled) { setAllTags(all); setFileTags(file); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fileId]);

  const fileTagIds = new Set(fileTags.map((t) => t.id));
  const filtered = allTags
    .filter((t) => !fileTagIds.has(t.id))
    .filter((t) => !search || t.name.toLowerCase().includes(search.toLowerCase()));

  const handleAdd = useCallback(async (tag: TagInfo) => {
    if (fileId == null || busy) return;
    setBusy(true);
    if (await addTagToFile(fileId, tag.id)) setFileTags((prev) => [...prev, tag]);
    setBusy(false);
  }, [fileId, busy]);

  const handleRemove = useCallback(async (tag: TagInfo) => {
    if (fileId == null || busy) return;
    setBusy(true);
    if (await removeTagFromFile(fileId, tag.id)) setFileTags((prev) => prev.filter((t) => t.id !== tag.id));
    setBusy(false);
  }, [fileId, busy]);

  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    const tag = await createTag(name);
    if (tag) {
      setAllTags((prev) => [...prev, tag]);
      if (fileId != null) {
        await addTagToFile(fileId, tag.id);
        setFileTags((prev) => [...prev, tag]);
      }
      setNewName('');
    }
    setBusy(false);
  }, [newName, fileId, busy]);

  if (fileId == null) {
    return (
      <div className={className}>
        <p className="text-sm text-text-muted italic text-center py-8">No file selected.</p>
      </div>
    );
  }

  const sectionClass = 'bg-dark-bgSecondary/50 border border-dark-border/50 rounded-lg p-4 space-y-3';
  const labelClass = 'text-xs font-medium text-text-muted';

  return (
    <div className={className}>
      <div className="space-y-4">

        {/* Current file tags */}
        <div className={sectionClass}>
          <div className="flex items-center gap-2">
            <Tag className="w-3.5 h-3.5 text-text-muted" />
            <label className={labelClass}>File Tags</label>
            {loading && <Loader2 className="w-3 h-3 text-text-muted animate-spin" />}
          </div>
          <div className="flex flex-wrap gap-1.5 min-h-[28px]">
            {fileTags.length === 0 && !loading && (
              <span className="text-xs text-text-muted/60 italic">No tags assigned</span>
            )}
            {fileTags.map((tag) => (
              <span key={tag.id} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${tagColor(tag.type)}`}>
                {tag.name}
                <button onClick={() => handleRemove(tag)} disabled={busy}
                  className="hover:text-white transition-colors disabled:opacity-40">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Search available tags */}
        <div className={sectionClass}>
          <label className={labelClass}>Add Tags</label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tags…"
              className="w-full text-sm bg-dark-bgPrimary border border-blue-800/40 rounded pl-7 pr-2 py-1.5 text-text-primary placeholder:text-text-muted/40"
            />
          </div>
          <div className="max-h-36 overflow-y-auto space-y-1">
            {filtered.length === 0 && (
              <p className="text-xs text-text-muted/60 italic py-1">
                {search ? 'No matching tags' : 'All tags assigned'}
              </p>
            )}
            {filtered.map((tag) => (
              <button key={tag.id} onClick={() => handleAdd(tag)} disabled={busy}
                className={`flex items-center gap-2 w-full text-left text-xs px-2 py-1 rounded border transition-colors
                  hover:brightness-125 disabled:opacity-40 ${tagColor(tag.type)}`}>
                <Plus className="w-3 h-3 shrink-0" />
                {tag.name}
                {tag.count != null && <span className="ml-auto text-[10px] opacity-60">{tag.count}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Create new tag */}
        <div className={sectionClass}>
          <label className={labelClass}>Create Tag</label>
          <div className="flex gap-2">
            <input
              value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="New tag name…"
              className="flex-1 text-sm bg-dark-bgPrimary border border-blue-800/40 rounded px-2 py-1.5 text-text-primary placeholder:text-text-muted/40"
            />
            <button onClick={handleCreate} disabled={busy || !newName.trim()}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-blue-700 hover:bg-blue-600 text-white disabled:opacity-40 transition-colors">
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              Create
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
