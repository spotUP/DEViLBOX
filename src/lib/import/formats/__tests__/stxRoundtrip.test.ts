/**
 * Regression: STX (ScreamTracker Music Interface Kit) shares S3M's non-canonical
 * variable-length row packing, so no from-scratch encoder reproduces a file's
 * bytes — the harness measured stx at 0.0000. Fixed with the structural raw-block
 * carrier (blockRawBytes + blockRows on the variable layout); see
 * variableBlockCarrier.testkit.ts for the asserted invariants.
 */
import { parseSTXFile } from '../STXParser';
import { describeVariableBlockCarrier } from './variableBlockCarrier.testkit';

describeVariableBlockCarrier('stx', parseSTXFile);
