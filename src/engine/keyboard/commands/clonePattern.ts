import { useTrackerStore } from '@stores/useTrackerStore';
import { Pattern } from '@/types/tracker';

/**
 * Clone Pattern - Create a deep copy of the current pattern
 *
 * Creates a duplicate of the current pattern and adds it to the pattern list.
 * The cloned pattern gets a "(copy)" suffix, with incrementing numbers for multiple clones.
 * Used for creating pattern variations while preserving the original.
 *
 * @returns true (always succeeds)
 */
export function clonePattern(): boolean {
  const { patterns, currentPatternIndex, addPattern } = useTrackerStore.getState();
  const currentPattern = patterns[currentPatternIndex];

  if (!currentPattern) {
    console.warn('[clonePattern] No pattern at index', currentPatternIndex);
    return true;
  }

  // Deep clone the pattern
  const clonedPattern: Pattern = JSON.parse(JSON.stringify(currentPattern));

  // Generate unique name
  clonedPattern.name = generateCloneName(currentPattern.name, patterns);

  // Add the cloned pattern
  addPattern(clonedPattern);

  return true;
}

/**
 * Generate a unique name for the cloned pattern
 * @param baseName - Original pattern name
 * @param patterns - All existing patterns
 * @returns Unique name with (copy N) suffix
 */
function generateCloneName(baseName: string, patterns: Pattern[]): string {
  const baseWithCopy = `${baseName} (copy)`;

  // Check if base name + (copy) exists
  if (!patterns.some(p => p.name === baseWithCopy)) {
    return baseWithCopy;
  }

  // Find the highest copy number
  let maxCopyNum = 1;
  const copyRegex = new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(copy (\\d+)\\)$`);

  patterns.forEach(pattern => {
    const match = pattern.name.match(copyRegex);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxCopyNum) {
        maxCopyNum = num;
      }
    }
  });

  return `${baseName} (copy ${maxCopyNum + 1})`;
}
