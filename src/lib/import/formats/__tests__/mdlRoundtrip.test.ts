/**
 * Regression: DigiTrakker (.mdl) packs each track (one channel column) with
 * run-length/copy compression (empty-run, repeat-previous, copy-from-row) — a
 * non-canonical encoding no from-scratch encoder reproduces, so the harness
 * measured mdl at 0.0000. Fixed with the structural raw-block carrier
 * (blockRawBytes + blockRows on the variable layout); see
 * variableBlockCarrier.testkit.ts for the asserted invariants.
 */
import { parseMDLFile } from '../MDLParser';
import { describeVariableBlockCarrier } from './variableBlockCarrier.testkit';

describeVariableBlockCarrier('mdl', parseMDLFile);
