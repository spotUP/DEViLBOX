/**
 * Regression: HVL (HivelyTracker) packs each track with a variable-length run
 * scheme (1-byte no-op vs 5-byte full step) — a non-canonical encoding no
 * from-scratch encoder reproduces, so the harness measured hivelyHVL at 0.3037.
 * Fixed with the structural raw-block carrier (blockRawBytes + blockRows on the
 * variable layout, one block per track); see variableBlockCarrier.testkit.ts for
 * the asserted invariants. AHX (fixed layout) is unaffected — separate path.
 */
import { parseHivelyFile } from '../HivelyParser';
import { describeVariableBlockCarrier } from './variableBlockCarrier.testkit';

describeVariableBlockCarrier('hivelyHVL', parseHivelyFile);
