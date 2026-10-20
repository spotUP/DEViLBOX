/**
 * The channel header dots button, the channel header right-click menu and the
 * grid right-click "Channel" submenu all take their items from
 * useChannelMenuItems. Add Channel follows the header "+" rule (under 16
 * channels), and Remove Channel lives only in the channel items.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, renderHook, fireEvent, cleanup, within } from '@testing-library/react';
import type { MenuItemType } from '@components/common/ContextMenu';

const builders: Array<() => MenuItemType[]> = [];

vi.mock('../useChannelMenuItems', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../useChannelMenuItems')>();
  return {
    ...actual,
    useChannelMenuItems: (...args: Parameters<typeof actual.useChannelMenuItems>) => {
      const build = actual.useChannelMenuItems(...args);
      builders.push(build);
      return build;
    },
  };
});

import { useChannelMenuItems, MAX_CHANNELS, type ChannelMenuHandlers } from '../useChannelMenuItems';
import { ChannelContextMenu } from '../ChannelContextMenu';
import { CellContextMenu } from '../CellContextMenu';
import { useTrackerStore } from '@stores/useTrackerStore';

const noop = () => {};
const handlers: ChannelMenuHandlers = {
  onFillPattern: noop, onClearChannel: noop, onCopyChannel: noop, onCutChannel: noop,
  onPasteChannel: noop, onTranspose: noop, onHumanize: noop, onInterpolate: noop,
  onAcidGenerator: noop, onRandomize: noop,
};

const ids = (items: MenuItemType[]): string[] =>
  items.flatMap((i) => ('id' in i && i.id ? [i.id] : []));

function setChannelCount(n: number) {
  while ((useTrackerStore.getState().patterns[0]?.channels.length ?? 0) < n) useTrackerStore.getState().addChannel();
}

beforeEach(() => { builders.length = 0; });
afterEach(cleanup);

describe('channel menus share one item list', () => {
  it('dots button and grid Channel submenu use the same builder and ids', () => {
    setChannelCount(4);
    const st = useTrackerStore.getState();
    const pattern = st.patterns[st.currentPatternIndex];
    const channel = pattern.channels[0];

    const dots = render(
      <ChannelContextMenu channelIndex={0} channel={channel} patternId={pattern.id} patternLength={pattern.length} {...handlers} />,
    );
    fireEvent.click(dots.getByRole('button'));
    dots.unmount();

    const grid = render(
      <CellContextMenu position={{ x: 5, y: 5 }} onClose={noop} rowIndex={0} channelIndex={0} channelMenuHandlers={handlers} />,
    );
    // Grid top level: Channel submenu present, Remove Channel not duplicated at top level.
    expect(grid.getByText('Channel')).toBeTruthy();
    expect(within(grid.baseElement).queryByText('Remove Channel')).toBeNull();
    expect(within(grid.baseElement).queryByText('Note Columns')).toBeNull();

    expect(builders.length).toBeGreaterThanOrEqual(2);
    const first = ids(builders[0]());
    const last = ids(builders[builders.length - 1]());
    expect(first).toEqual(last);
    expect(first).toEqual(expect.arrayContaining(['note-columns', 'add-channel', 'remove-channel']));
  });

  it('offers Add Channel under 16 channels and not at 16 or in format mode', () => {
    setChannelCount(4);
    const channel = useTrackerStore.getState().patterns[0].channels[0];
    const build = (fm?: boolean) =>
      renderHook(() => useChannelMenuItems(0, channel, 'p', { ...handlers, isFormatMode: fm })).result.current;

    expect(ids(build()())).toContain('add-channel');
    expect(ids(build(true)())).not.toContain('add-channel');
    setChannelCount(MAX_CHANNELS);
    expect(ids(build()())).not.toContain('add-channel');
  });
});
