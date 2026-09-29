import { SIDECHAIN_KEY_DRUMS } from '@engine/tone/sidechainKey';

/**
 * The choices for a sidechain effect's key (its `sidechainSource`): its own
 * input, the song's drums found by the classifier, or a fixed channel. One
 * list for the master chain card and every sidechain effect editor.
 */
export function sidechainKeyOptions(channelCount: number, channelNames: readonly (string | null | undefined)[]): { value: string; label: string }[] {
  return [
    { value: '-1', label: 'Own input' },
    { value: String(SIDECHAIN_KEY_DRUMS), label: 'Drums (auto)' },
    ...Array.from({ length: channelCount }, (_, i) => {
      const name = channelNames[i]?.trim();
      return {
        value: String(i),
        label: name && !/^(ch|channel)\s*\d+$/i.test(name) ? `CH ${i + 1} ${name}` : `CH ${i + 1}`,
      };
    }),
  ];
}
