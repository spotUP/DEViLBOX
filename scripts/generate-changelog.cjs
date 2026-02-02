#!/usr/bin/env node
/**
 * Generate changelog from git commits
 *
 * Uses conventional commit format:
 * - feat: New feature
 * - fix: Bug fix
 * - perf: Performance improvement
 * - refactor: Code refactoring
 * - docs: Documentation
 * - style: Styling changes
 * - chore: Maintenance
 *
 * Run: node scripts/generate-changelog.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Config
const MAX_COMMITS = 50; // Max commits to parse
const MAX_ENTRIES = 10; // Max changelog entries to show
const OUTPUT_FILE = path.join(__dirname, '../src/generated/changelog.ts');

// Commit type mapping
const TYPE_MAP = {
  'feat': 'feature',
  'feature': 'feature',
  'fix': 'fix',
  'bugfix': 'fix',
  'perf': 'improvement',
  'refactor': 'improvement',
  'improve': 'improvement',
  'style': 'improvement',
  'ui': 'improvement',
  'docs': 'improvement',
  'chore': null, // Skip chore commits
  'build': null, // Skip build commits
  'ci': null,    // Skip CI commits
  'test': null,  // Skip test commits
};

// Get git log
function getGitLog() {
  try {
    const log = execSync(
      `git log --pretty=format:"%H|%ad|%s" --date=short -n ${MAX_COMMITS}`,
      { encoding: 'utf-8', cwd: path.join(__dirname, '..') }
    );
    return log.trim().split('\n').filter(Boolean);
  } catch (error) {
    console.error('Failed to get git log:', error.message);
    return [];
  }
}

// Get current version from package.json
function getVersion() {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8')
    );
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

// Get git commit count for build number
function getCommitCount() {
  try {
    return execSync('git rev-list --count HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return '0';
  }
}

// Get short git hash
function getGitHash() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

// Parse a commit message
function parseCommit(line) {
  const [hash, date, ...messageParts] = line.split('|');
  const message = messageParts.join('|');

  // Try to parse conventional commit format: type(scope): description
  // or type: description
  const match = message.match(/^(\w+)(?:\([^)]+\))?:\s*(.+)$/i);

  if (match) {
    const [, type, description] = match;
    const mappedType = TYPE_MAP[type.toLowerCase()];

    if (mappedType) {
      return {
        hash,
        date,
        type: mappedType,
        description: description.charAt(0).toUpperCase() + description.slice(1),
      };
    }
  }

  // For non-conventional commits, try to infer type from keywords
  const lowerMessage = message.toLowerCase();
  let type = 'improvement';

  if (lowerMessage.includes('fix') || lowerMessage.includes('bug')) {
    type = 'fix';
  } else if (lowerMessage.includes('add') || lowerMessage.includes('new') || lowerMessage.includes('implement')) {
    type = 'feature';
  }

  // Skip merge commits and very short messages
  if (message.startsWith('Merge') || message.length < 10) {
    return null;
  }

  return {
    hash,
    date,
    type,
    description: message.charAt(0).toUpperCase() + message.slice(1),
  };
}

// Group commits by date
function groupByDate(commits) {
  const groups = new Map();

  for (const commit of commits) {
    if (!commit) continue;

    const existing = groups.get(commit.date) || [];
    existing.push(commit);
    groups.set(commit.date, existing);
  }

  return groups;
}

// Generate TypeScript file
function generateTypeScript(entries, version, buildNumber, gitHash) {
  const entriesJson = JSON.stringify(entries, null, 2)
    .replace(/"type": "feature"/g, "type: 'feature'")
    .replace(/"type": "fix"/g, "type: 'fix'")
    .replace(/"type": "improvement"/g, "type: 'improvement'")
    .replace(/"(\w+)":/g, '$1:')
    .replace(/"/g, "'");

  return `/**
 * Auto-generated changelog from git commits
 * Generated: ${new Date().toISOString()}
 *
 * DO NOT EDIT MANUALLY - This file is regenerated on build
 * To add changelog entries, use conventional commit messages:
 *   feat: Add new feature
 *   fix: Fix a bug
 *   perf: Improve performance
 */

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: {
    type: 'feature' | 'fix' | 'improvement';
    description: string;
  }[];
}

// Build info
export const BUILD_VERSION = '${version}';
export const BUILD_NUMBER = '${buildNumber}';
export const BUILD_HASH = '${gitHash}';
export const BUILD_DATE = '${new Date().toISOString().split('T')[0]}';

// Full semantic version with build number
export const FULL_VERSION = \`\${BUILD_VERSION}.\${BUILD_NUMBER}\`;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = ${entriesJson};

// Current display version
export const CURRENT_VERSION = FULL_VERSION;

// Get all changes from the last N entries
export function getRecentChanges(count: number = 10): ChangelogEntry[] {
  return CHANGELOG.slice(0, count);
}
`;
}

// Main
function main() {
  console.log('Generating changelog from git commits...');

  const version = getVersion();
  const buildNumber = getCommitCount();
  const gitHash = getGitHash();

  console.log(`Version: ${version}, Build: ${buildNumber}, Hash: ${gitHash}`);

  const log = getGitLog();
  const commits = log.map(parseCommit).filter(Boolean);
  const grouped = groupByDate(commits);

  // Convert to changelog entries
  const entries = [];
  let entryCount = 0;

  for (const [date, dateCommits] of grouped) {
    if (entryCount >= MAX_ENTRIES) break;

    // Deduplicate similar descriptions
    const seen = new Set();
    const uniqueChanges = dateCommits.filter(c => {
      const key = c.description.toLowerCase().slice(0, 30);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (uniqueChanges.length > 0) {
      // Use date as version identifier if we're grouping by date
      // but keeping the semantic version for the first one
      entries.push({
        version: entryCount === 0 ? version : date,
        date,
        changes: uniqueChanges.map(c => ({
          type: c.type,
          description: c.description,
        })),
      });
      entryCount++;
    }
  }

  // Ensure output directory exists
  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write the file
  const content = generateTypeScript(entries, version, buildNumber, gitHash);
  fs.writeFileSync(OUTPUT_FILE, content);

  console.log(`Generated ${OUTPUT_FILE}`);
  console.log(`  - ${entries.length} changelog entries`);
  console.log(`  - ${commits.length} commits parsed`);
}

main();
