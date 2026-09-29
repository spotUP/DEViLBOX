/**
 * The whole master chain card selects its effect, not only its upper half.
 *
 * The routing row ("Apply to", channel buttons) sat in a container that
 * stopped every click so the buttons would not also select the card - which
 * made the lower half of every card dead (2026-09-29).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { SortableEffectItem } from '../MasterEffectsModal';

afterEach(cleanup);

function renderCard() {
  const onSelect = vi.fn();
  const onChannelSelect = vi.fn();
  const effect = { id: 'fx1', category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: {} };
  render(
    <DndContext>
      <SortableContext items={['fx1']}>
        <SortableEffectItem
          effect={effect as never}
          isSelected={false}
          onSelect={onSelect}
          onToggle={() => {}}
          onRemove={() => {}}
          onWetChange={() => {}}
          onChannelSelect={onChannelSelect}
          onKeyChange={() => {}}
          numChannels={4}
          channelNames={[]}
          isolationSupported={true}
        />
      </SortableContext>
    </DndContext>,
  );
  return { onSelect, onChannelSelect };
}

describe('master chain card click area', () => {
  it('selects the effect from the routing row\'s empty space', () => {
    const { onSelect } = renderCard();
    fireEvent.click(screen.getByText('Apply to'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('a channel button routes without selecting the card', () => {
    const { onSelect, onChannelSelect } = renderCard();
    fireEvent.click(screen.getByTitle('Channel 2'));
    expect(onChannelSelect).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
