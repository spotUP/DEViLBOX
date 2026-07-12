/**
 * Regression: PolyTracker (.ptm) uses S3M-style non-canonical variable-length row
 * packing, so no from-scratch encoder reproduces a file's bytes — the harness
 * measured ptm at 0.0000. Fixed with the structural raw-block carrier
 * (blockRawBytes + blockRows on the variable layout); see
 * variableBlockCarrier.testkit.ts for the asserted invariants.
 */
import { parsePTMFile } from '../PTMParser';
import { describeVariableBlockCarrier } from './variableBlockCarrier.testkit';

describeVariableBlockCarrier('ptm', parsePTMFile);
