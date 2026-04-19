# Test fixtures

Real song files used by CI tests — **never synthetic byte layouts**.
Real songs catch real parser bugs that synthetic fixtures can't.

Keep each fixture as small as possible so CI stays fast.

## Current fixtures

- `mortimer-twang-2118bytes.mod` — a 4-channel Protracker `.mod` by
  Mortimer Twang, famously 2118 bytes in total. Released on Modland as a
  demonstration of how small a real tracker song can be. Perfect for parser
  smoke tests because every byte is deliberate.

## Loading in tests

```ts
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const FIXTURE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// NB: test file lives alongside its subject; import.meta.url anchors against
// the test file's own location. Adjust the relative path accordingly.
const bytes = readFileSync(resolve(FIXTURE_DIR, 'mortimer-twang-2118bytes.mod'));
const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
```

## Adding new fixtures

- Source real files (demoscene intros, chiptune archive samples, etc.).
- Keep each under ~20 KB when practical.
- Credit the author in this README.
- Do NOT generate bytes by hand — always use a real song.
