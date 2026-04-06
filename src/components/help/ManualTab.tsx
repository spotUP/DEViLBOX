/**
 * ManualTab — Renders the user manual with sidebar chapter navigation,
 * markdown content rendering, inline images, and search.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { ManualChapter } from '@/data/manualChapters';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ManualTabProps {
  chapters: ManualChapter[];
  parts: { number: number; name: string; chapters: number[] }[];
  currentIndex: number;
  onSelectChapter: (index: number) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  /** Active keyboard scheme data — key→command mapping loaded from /keyboard-schemes/{scheme}.json */
  activeSchemeData: Record<string, string> | null;
  /** Name of the active scheme (e.g. "fasttracker2") */
  activeSchemeName: string;
}

// ── Dynamic Keyboard Shortcuts ────────────────────────────────────────────────

interface ShortcutGroup {
  title: string;
  shortcuts: { key: string; action: string }[];
}

/** Build categorized shortcut groups from the active scheme data (mirrors HelpModal logic) */
function buildShortcutGroups(schemeData: Record<string, string> | null): ShortcutGroup[] {
  if (!schemeData || Object.keys(schemeData).length === 0) return [];

  const cats: Record<string, { key: string; action: string }[]> = {};
  const addTo = (cat: string, key: string, cmd: string) => {
    if (!cats[cat]) cats[cat] = [];
    cats[cat].push({ key, action: cmd.replace(/_/g, ' ') });
  };

  for (const [key, cmd] of Object.entries(schemeData)) {
    if (typeof cmd !== 'string') continue;
    if (/^(play_|stop|pause|continue_)/.test(cmd)) addTo('Transport', key, cmd);
    else if (/^(cursor_|jump_to_|goto_|seek_|scroll_|snap_|screen_|song_start|song_end|stay_in)/.test(cmd)) addTo('Navigation', key, cmd);
    else if (/^(insert_|delete_|clear_|roll_|advance_|backspace)/.test(cmd)) addTo('Editing', key, cmd);
    else if (/^(select_|mark_block|block_|unmark|copy_|cut_|paste_|quick_)/.test(cmd)) addTo('Selection & Clipboard', key, cmd);
    else if (/^transpose_/.test(cmd)) addTo('Transpose', key, cmd);
    else if (/^(set_octave|next_octave|prev_octave)/.test(cmd)) addTo('Octave', key, cmd);
    else if (/^(set_instrument|next_instrument|prev_instrument|set_sample|instrument_|swap_instrument)/.test(cmd)) addTo('Instruments', key, cmd);
    else if (/^(mute_|solo_|unmute_|set_track|set_multi|reset_channel|channel_)/.test(cmd)) addTo('Channels', key, cmd);
    else if (/^(next_pattern|prev_pattern|next_block|prev_block|clone_|next_order|prev_order|next_sequence|prev_sequence|set_position|save_position|goto_position|sequence_|set_playback)/.test(cmd)) addTo('Patterns & Position', key, cmd);
    else if (/^(increase_|decrease_|set_step|set_edit|set_quantize|double_block|halve_block)/.test(cmd)) addTo('Step & Volume', key, cmd);
    else if (/^(toggle_|show_|open_|view_|close_|help$|configure|order_list|layout_|display_|cycle_|switch_to)/.test(cmd)) addTo('View & Settings', key, cmd);
    else if (/^(undo|redo|save_|export_|load_|new_|fast_save)/.test(cmd)) addTo('File & History', key, cmd);
    else if (/^(tracker_|power_cut|dj_)/.test(cmd)) addTo('DJ & Scratch', key, cmd);
    else addTo('Other', key, cmd);
  }

  const catOrder = ['Transport', 'Navigation', 'Editing', 'Selection & Clipboard', 'Transpose',
    'Octave', 'Instruments', 'Channels', 'Patterns & Position', 'Step & Volume',
    'View & Settings', 'File & History', 'DJ & Scratch', 'Other'];

  const groups: ShortcutGroup[] = [{
    title: 'Note Entry',
    shortcuts: [
      { key: 'Z, S, X, D, C...', action: 'Piano keys lower row (C-B)' },
      { key: 'Q, 2, W, 3, E...', action: 'Piano keys upper row (+1 octave)' },
      { key: '0-9, A-F', action: 'Hex digits (instrument, volume, effect)' },
    ],
  }];

  for (const cat of catOrder) {
    if (cats[cat]?.length) {
      groups.push({ title: cat, shortcuts: cats[cat] });
    }
  }

  return groups;
}

/** Render dynamic keyboard shortcut tables */
function renderDynamicShortcuts(schemeData: Record<string, string> | null, schemeName: string): React.ReactNode[] {
  const groups = buildShortcutGroups(schemeData);
  if (groups.length === 0) {
    return [
      <p key="no-scheme" className="text-xs font-mono text-ft2-textDim italic my-2">
        No keyboard scheme loaded. Shortcuts will appear here when a scheme is active.
      </p>,
    ];
  }

  const nodes: React.ReactNode[] = [
    <div key="scheme-badge" className="text-xs font-mono text-ft2-textDim mb-3 bg-black/20 border border-ft2-border px-3 py-1.5 inline-block">
      Active scheme: <span className="text-ft2-highlight">{schemeName}</span>
      {' '}<span className="text-ft2-textDim">— shortcuts update automatically when you switch schemes</span>
    </div>,
  ];

  for (const group of groups) {
    nodes.push(
      <div key={`grp-${group.title}`} className="text-base font-bold text-ft2-highlight mt-5 mb-2 font-mono">
        {group.title}
      </div>
    );
    // Render as table
    const tableLines = [
      '| Key | Action |',
      '|-----|--------|',
      ...group.shortcuts.map(s => `| ${s.key} | ${s.action} |`),
    ];
    nodes.push(renderTable(tableLines, nodes.length));
  }

  return nodes;
}

// ── Simple Markdown Renderer ───────────────────────────────────────────────────

function renderMarkdown(
  md: string,
  schemeData?: Record<string, string> | null,
  schemeName?: string,
): React.ReactNode[] {
  const lines = md.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Dynamic token: {{keyboard-shortcuts}} — replaced with active scheme's shortcuts
    if (line.trim() === '{{keyboard-shortcuts}}') {
      nodes.push(...renderDynamicShortcuts(schemeData ?? null, schemeName ?? 'unknown'));
      i++;
      continue;
    }

    // Fenced code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      nodes.push(
        <pre
          key={nodes.length}
          className="bg-black/40 border border-ft2-border p-3 my-2 overflow-x-auto text-sm font-mono text-ft2-text"
        >
          {lang && (
            <div className="text-ft2-textDim text-xs mb-1">{lang}</div>
          )}
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      nodes.push(
        <hr key={nodes.length} className="border-ft2-border my-4" />
      );
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const headingClasses: Record<number, string> = {
        1: 'text-2xl font-bold text-ft2-highlight mt-6 mb-3',
        2: 'text-xl font-bold text-ft2-highlight mt-5 mb-2',
        3: 'text-lg font-bold text-ft2-text mt-4 mb-2',
        4: 'text-base font-bold text-ft2-textDim mt-3 mb-1',
        5: 'text-sm font-bold text-ft2-textDim mt-2 mb-1',
        6: 'text-sm font-bold text-ft2-textDim mt-2 mb-1',
      };
      nodes.push(
        <div key={nodes.length} className={`font-mono ${headingClasses[level]}`}>
          {renderInline(text)}
        </div>
      );
      i++;
      continue;
    }

    // Image: ![alt](src)
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      nodes.push(
        <div key={nodes.length} className="my-3">
          <img
            src={imgMatch[2]}
            alt={imgMatch[1]}
            className="max-w-full border border-ft2-border"
            loading="lazy"
          />
          {imgMatch[1] && (
            <div className="text-xs font-mono text-ft2-textDim mt-1">
              {imgMatch[1]}
            </div>
          )}
        </div>
      );
      i++;
      continue;
    }

    // Table: detect by | at start
    if (line.trimStart().startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      nodes.push(renderTable(tableLines, nodes.length));
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        listItems.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      nodes.push(
        <ul key={nodes.length} className="list-disc list-inside my-2 space-y-1">
          {listItems.map((item, idx) => (
            <li key={idx} className="text-sm font-mono text-ft2-text">
              {renderInline(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        listItems.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
        i++;
      }
      nodes.push(
        <ol key={nodes.length} className="list-decimal list-inside my-2 space-y-1">
          {listItems.map((item, idx) => (
            <li key={idx} className="text-sm font-mono text-ft2-text">
              {renderInline(item)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph (collect contiguous non-empty non-special lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('#') &&
      !lines[i].startsWith('```') &&
      !lines[i].startsWith('|') &&
      !/^!\[/.test(lines[i]) &&
      !/^---+$/.test(lines[i].trim()) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    nodes.push(
      <p key={nodes.length} className="text-sm font-mono text-ft2-text leading-relaxed my-2">
        {renderInline(paraLines.join(' '))}
      </p>
    );
  }

  return nodes;
}

/** Render inline markdown: **bold**, `code`, [links](url), ![img](url) */
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  // Match **bold**, `code`, inline images ![alt](url), [link](url)
  const regex = /(\*\*(.+?)\*\*)|(`([^`]+)`)|(\!\[([^\]]*)\]\(([^)]+)\))|(\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[1]) {
      // **bold**
      parts.push(
        <span key={parts.length} className="font-bold text-ft2-highlight">
          {match[2]}
        </span>
      );
    } else if (match[3]) {
      // `code`
      parts.push(
        <code
          key={parts.length}
          className="bg-black/30 px-1 py-0.5 text-ft2-highlight border border-ft2-border text-sm"
        >
          {match[4]}
        </code>
      );
    } else if (match[5]) {
      // ![alt](url) inline image
      parts.push(
        <img
          key={parts.length}
          src={match[7]}
          alt={match[6]}
          className="inline max-h-16 border border-ft2-border mx-1"
          loading="lazy"
        />
      );
    } else if (match[8]) {
      // [link](url)
      parts.push(
        <a
          key={parts.length}
          href={match[10]}
          className="text-ft2-highlight underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          {match[9]}
        </a>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

/** Render a markdown table */
function renderTable(tableLines: string[], key: number): React.ReactNode {
  const rows = tableLines
    .filter(line => !/^\s*\|[\s:|-]+\|\s*$/.test(line)) // filter separator rows
    .map(line =>
      line
        .split('|')
        .slice(1, -1) // remove empty first/last from leading/trailing |
        .map(cell => cell.trim())
    );

  if (rows.length === 0) return null;
  const header = rows[0];
  const body = rows.slice(1);

  return (
    <div key={key} className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm font-mono">
        <thead>
          <tr>
            {header.map((cell, idx) => (
              <th
                key={idx}
                className="border border-ft2-border bg-ft2-panel px-2 py-1 text-left text-ft2-highlight font-bold"
              >
                {renderInline(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ridx) => (
            <tr key={ridx}>
              {row.map((cell, cidx) => (
                <td
                  key={cidx}
                  className="border border-ft2-border px-2 py-1 text-ft2-text"
                >
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── ManualTab Component ────────────────────────────────────────────────────────

export const ManualTab: React.FC<ManualTabProps> = ({
  chapters,
  parts,
  currentIndex,
  onSelectChapter,
  searchQuery,
  onSearchChange,
  activeSchemeData,
  activeSchemeName,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [collapsedParts, setCollapsedParts] = useState<Set<number>>(new Set());

  // Scroll content to top when chapter changes
  useEffect(() => {
    contentRef.current?.scrollTo(0, 0);
  }, [currentIndex]);

  const togglePart = useCallback((partNumber: number) => {
    setCollapsedParts(prev => {
      const next = new Set(prev);
      if (next.has(partNumber)) {
        next.delete(partNumber);
      } else {
        next.add(partNumber);
      }
      return next;
    });
  }, []);

  // Empty state
  if (chapters.length === 0 && !searchQuery) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="text-sm font-mono text-ft2-textDim mb-3">
            Manual not yet generated.
          </div>
          <div className="text-xs font-mono text-ft2-text bg-black/30 border border-ft2-border px-4 py-2">
            npx tsx docs/manual/build-app-manifest.ts
          </div>
        </div>
      </div>
    );
  }

  // No search results
  if (chapters.length === 0 && searchQuery) {
    return (
      <div className="flex h-full">
        {/* Sidebar */}
        <div className="w-56 flex-shrink-0 border-r border-ft2-border bg-ft2-panel flex flex-col">
          <div className="p-2 border-b border-ft2-border">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search manual..."
              className="w-full bg-ft2-bg border border-ft2-border px-2 py-1 text-xs font-mono text-ft2-text placeholder:text-ft2-textDim focus:outline-none focus:border-ft2-highlight"
            />
          </div>
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="text-xs font-mono text-ft2-textDim text-center">
              No chapters match your search.
            </div>
          </div>
        </div>
        {/* Empty content */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-sm font-mono text-ft2-textDim">
            No results found.
          </div>
        </div>
      </div>
    );
  }

  const currentChapter = chapters[currentIndex] || chapters[0];

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-56 flex-shrink-0 border-r border-ft2-border bg-ft2-panel flex flex-col">
        {/* Search */}
        <div className="p-2 border-b border-ft2-border">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search manual..."
            className="w-full bg-ft2-bg border border-ft2-border px-2 py-1 text-xs font-mono text-ft2-text placeholder:text-ft2-textDim focus:outline-none focus:border-ft2-highlight"
          />
        </div>

        {/* Chapter tree */}
        <div className="flex-1 overflow-y-auto scrollbar-ft2">
          {parts.map(part => {
            const partChapters = chapters.filter(ch => ch.partNumber === part.number);
            if (partChapters.length === 0) return null;
            const isCollapsed = collapsedParts.has(part.number);

            return (
              <div key={part.number}>
                {/* Part header */}
                <button
                  onClick={() => togglePart(part.number)}
                  className="w-full text-left px-2 py-1.5 text-xs font-mono font-bold text-ft2-highlight bg-ft2-bg border-b border-ft2-border hover:bg-ft2-panel flex items-center gap-1"
                >
                  <span className="text-ft2-textDim">{isCollapsed ? '+' : '-'}</span>
                  <span className="uppercase truncate">
                    {part.name}
                  </span>
                </button>

                {/* Chapters */}
                {!isCollapsed && partChapters.map(ch => {
                  const chapterIdx = chapters.indexOf(ch);
                  const isActive = chapterIdx === currentIndex;
                  return (
                    <button
                      key={ch.id}
                      onClick={() => onSelectChapter(chapterIdx)}
                      className={`
                        w-full text-left px-3 py-1 text-sm font-mono border-b border-ft2-border/50 truncate
                        ${isActive
                          ? 'bg-ft2-cursor text-ft2-bg font-bold'
                          : 'text-ft2-text hover:bg-ft2-bg'
                        }
                      `}
                      title={`${ch.number}. ${ch.title}`}
                    >
                      <span className="text-ft2-textDim mr-1">{ch.number}.</span>
                      {ch.title}
                    </button>
                  );
                })}
              </div>
            );
          })}

          {/* Chapters not in any part (fallback) */}
          {chapters
            .filter(ch => !parts.some(p => p.chapters.includes(ch.number)))
            .map(ch => {
              const chapterIdx = chapters.indexOf(ch);
              const isActive = chapterIdx === currentIndex;
              return (
                <button
                  key={ch.id}
                  onClick={() => onSelectChapter(chapterIdx)}
                  className={`
                    w-full text-left px-3 py-1 text-sm font-mono border-b border-ft2-border/50 truncate
                    ${isActive
                      ? 'bg-ft2-cursor text-ft2-bg font-bold'
                      : 'text-ft2-text hover:bg-ft2-bg'
                    }
                  `}
                  title={`${ch.number}. ${ch.title}`}
                >
                  <span className="text-ft2-textDim mr-1">{ch.number}.</span>
                  {ch.title}
                </button>
              );
            })}
        </div>
      </div>

      {/* Content pane */}
      <div ref={contentRef} className="flex-1 overflow-y-auto scrollbar-ft2 p-6">
        {/* Chapter heading */}
        <div className="mb-4 pb-3 border-b border-ft2-border">
          <div className="text-xs font-mono text-ft2-textDim uppercase mb-1">
            {currentChapter.part}
          </div>
          <h2 className="text-2xl font-mono font-bold text-ft2-highlight">
            {currentChapter.number}. {currentChapter.title}
          </h2>
        </div>

        {/* Rendered markdown content */}
        <div>{renderMarkdown(currentChapter.content, activeSchemeData, activeSchemeName)}</div>

        {/* Prev/Next navigation */}
        <div className="flex items-center justify-between mt-8 pt-4 border-t border-ft2-border">
          <button
            onClick={() => onSelectChapter(Math.max(0, currentIndex - 1))}
            disabled={currentIndex === 0}
            className={`
              px-3 py-1.5 font-mono text-sm border transition-colors
              ${currentIndex === 0
                ? 'bg-ft2-panel text-ft2-textDim border-ft2-border cursor-not-allowed'
                : 'bg-ft2-bg text-ft2-text border-ft2-border hover:border-ft2-highlight'
              }
            `}
          >
            PREV
          </button>
          <span className="text-xs font-mono text-ft2-textDim">
            {currentIndex + 1} / {chapters.length}
          </span>
          <button
            onClick={() => onSelectChapter(Math.min(chapters.length - 1, currentIndex + 1))}
            disabled={currentIndex === chapters.length - 1}
            className={`
              px-3 py-1.5 font-mono text-sm border transition-colors
              ${currentIndex === chapters.length - 1
                ? 'bg-ft2-panel text-ft2-textDim border-ft2-border cursor-not-allowed'
                : 'bg-ft2-bg text-ft2-text border-ft2-border hover:border-ft2-highlight'
              }
            `}
          >
            NEXT
          </button>
        </div>
      </div>
    </div>
  );
};
