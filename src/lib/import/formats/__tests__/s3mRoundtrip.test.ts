/**
 * Regression: ScreamTracker 3 (.s3m) packs pattern rows variable-length with a
 * non-canonical empty-row representation, so no from-scratch encoder reproduces a
 * file's bytes — the encoderRoundtrip harness measured s3m at 0.0000. Fixed with
 * the structural raw-block carrier (blockRawBytes + blockRows on the variable
 * layout); see variableBlockCarrier.testkit.ts for the asserted invariants.
 */
import { parseS3MFile } from '../S3MParser';
import { describeVariableBlockCarrier } from './variableBlockCarrier.testkit';

describeVariableBlockCarrier('s3m', parseS3MFile);
