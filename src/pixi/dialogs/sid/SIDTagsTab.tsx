/**
 * SIDTagsTab — Tag management for a SID file in the info modal.
 * Shows current file tags, searchable list of available tags, and new tag creation.
 */

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { fetchAllTags, fetchFileTags, addTagToFile, removeTagFromFile, createTag } from '@/lib/sid/composerApi';
import type { TagInfo } from '@/lib/sid/composerApi';
import { PixiLabel, PixiButton, PixiScrollView } from '../../components';
import { PixiPureTextInput } from '../../input/PixiPureTextInput';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';

interface SIDTagsTabProps {
  width: number;
  height: number;
  fileId: number | null;
}

const PAD = 16;

const getTagColors = (theme: ReturnType<typeof usePixiTheme>): Record<string, number> => ({
  music: theme.accentSecondary.color,
  collection: theme.success.color,
});
const getDefaultTagColor = (theme: ReturnType<typeof usePixiTheme>): number => theme.textMuted.color;

/** Colored tag badge with optional remove button */
const TagBadge: React.FC<{
  tag: TagInfo;
  tagColors: Record<string, number>;
  defaultTagColor: number;
  onRemove?: () => void;
  onAdd?: () => void;
}> = ({ tag, tagColors, defaultTagColor, onRemove, onAdd }) => {
  const bg = tagColors[tag.type] ?? defaultTagColor;
  return (
    <layoutContainer
      layout={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingLeft: 8,
        paddingRight: onRemove ? 4 : 8,
        paddingTop: 4,
        paddingBottom: 4,
        borderRadius: 6,
        backgroundColor: bg,
      }}
      eventMode={onAdd ? 'static' : 'auto'}
      cursor={onAdd ? 'pointer' : undefined}
      onPointerTap={onAdd}
    >
      <pixiBitmapText
        text={tag.name}
        style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
      />
      {onRemove && (
        <PixiButton
          label=""
          icon="close"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          width={18}
          height={18}
        />
      )}
    </layoutContainer>
  );
};

export const SIDTagsTab: React.FC<SIDTagsTabProps> = ({ width, height, fileId }) => {
  const theme = usePixiTheme();
  const contentW = width - PAD * 2;
  const tagColors = useMemo(() => getTagColors(theme), [theme]);
  const defaultTagColor = useMemo(() => getDefaultTagColor(theme), [theme]);

  const [allTags, setAllTags] = useState<TagInfo[]>([]);
  const [fileTags, setFileTags] = useState<TagInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [newTagName, setNewTagName] = useState('');

  // Fetch tags on mount / fileId change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const load = async () => {
      const [all, file] = await Promise.all([
        fetchAllTags(),
        fileId != null ? fetchFileTags(fileId) : Promise.resolve([]),
      ]);
      if (!cancelled) {
        setAllTags(all);
        setFileTags(file);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [fileId]);

  const fileTagIds = useMemo(() => new Set(fileTags.map((t) => t.id)), [fileTags]);

  const availableTags = useMemo(() => {
    const lc = search.toLowerCase();
    return allTags
      .filter((t) => !fileTagIds.has(t.id))
      .filter((t) => !lc || t.name.toLowerCase().includes(lc));
  }, [allTags, fileTagIds, search]);

  const handleAdd = useCallback(
    async (tag: TagInfo) => {
      if (fileId == null) return;
      const ok = await addTagToFile(fileId, tag.id);
      if (ok) setFileTags((prev) => [...prev, tag]);
    },
    [fileId],
  );

  const handleRemove = useCallback(
    async (tag: TagInfo) => {
      if (fileId == null) return;
      const ok = await removeTagFromFile(fileId, tag.id);
      if (ok) setFileTags((prev) => prev.filter((t) => t.id !== tag.id));
    },
    [fileId],
  );

  const handleCreate = useCallback(async () => {
    const name = newTagName.trim();
    if (!name) return;
    const created = await createTag(name);
    if (created) {
      setAllTags((prev) => [...prev, created]);
      setNewTagName('');
      // Auto-add to file if we have one
      if (fileId != null) {
        const ok = await addTagToFile(fileId, created.id);
        if (ok) setFileTags((prev) => [...prev, created]);
      }
    }
  }, [newTagName, fileId]);

  if (fileId == null) {
    return (
      <layoutContainer layout={{ padding: PAD, width }}>
        <PixiLabel text="No file selected" size="sm" color="textMuted" />
      </layoutContainer>
    );
  }

  // Available tags list height: fill remaining space
  const listH = Math.max(80, height - 230);

  return (
    <layoutContainer layout={{ flexDirection: 'column', gap: 12, padding: PAD, width }}>
      {/* ── File Tags ──────────────────────────────────────────────── */}
      <PixiLabel text="File Tags" size="xs" weight="semibold" color="textSecondary" />
      <layoutContainer
        layout={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 6,
          width: contentW,
          minHeight: 28,
          padding: 8,
          borderRadius: 8,
          borderWidth: 1,
          backgroundColor: theme.bg.color,
          borderColor: theme.border.color,
        }}
      >
        {loading && (
          <pixiBitmapText
            text="Loading…"
            style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
            tint={theme.textMuted.color}
          />
        )}
        {!loading && fileTags.length === 0 && (
          <pixiBitmapText
            text="No tags yet"
            style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
            tint={theme.textMuted.color}
            alpha={0.5}
          />
        )}
        {fileTags.map((tag) => (
          <TagBadge key={tag.id} tag={tag} tagColors={tagColors} defaultTagColor={defaultTagColor} onRemove={() => handleRemove(tag)} />
        ))}
      </layoutContainer>

      {/* ── Search ─────────────────────────────────────────────────── */}
      <PixiPureTextInput
        value={search}
        onChange={setSearch}
        placeholder="Search tags…"
        width={contentW}
      />

      {/* ── Available Tags ─────────────────────────────────────────── */}
      <PixiScrollView width={contentW} height={listH} contentHeight={Math.max(listH, availableTags.length * 30)}>
        <layoutContainer layout={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, width: contentW - 12, padding: 4 }}>
          {availableTags.map((tag) => (
            <TagBadge key={tag.id} tag={tag} tagColors={tagColors} defaultTagColor={defaultTagColor} onAdd={() => handleAdd(tag)} />
          ))}
          {!loading && availableTags.length === 0 && (
            <pixiBitmapText
              text={search ? 'No matching tags' : 'All tags assigned'}
              style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
              tint={theme.textMuted.color}
              alpha={0.5}
            />
          )}
        </layoutContainer>
      </PixiScrollView>

      {/* ── Create New Tag ─────────────────────────────────────────── */}
      <layoutContainer layout={{ flexDirection: 'row', gap: 8, alignItems: 'center', width: contentW }}>
        <PixiPureTextInput
          value={newTagName}
          onChange={setNewTagName}
          onSubmit={handleCreate}
          placeholder="New tag name…"
          width={contentW - 90}
        />
        <PixiButton
          label="Create"
          variant="primary"
          size="sm"
          onClick={handleCreate}
          width={80}
          disabled={!newTagName.trim()}
        />
      </layoutContainer>
    </layoutContainer>
  );
};
