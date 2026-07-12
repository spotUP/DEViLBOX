/**
 * Regression: Impulse Tracker (.it) packs pattern rows with mask/repeat
 * compression and omissible empty rows — a non-canonical encoding no from-scratch
 * encoder reproduces, so the harness measured it at 0.0000. Fixed with the
 * structural raw-block carrier (blockRawBytes + blockRows on the variable layout);
 * see variableBlockCarrier.testkit.ts for the asserted invariants.
 */
import { parseITFile } from '../ITParser';
import { describeVariableBlockCarrier } from './variableBlockCarrier.testkit';

describeVariableBlockCarrier('it', parseITFile);
