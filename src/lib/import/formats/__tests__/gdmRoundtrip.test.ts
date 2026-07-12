/**
 * Regression: GDM (General Digital Music) packs rows with an event-mask channel
 * byte and omissible channels — a non-canonical encoding no from-scratch encoder
 * reproduces, so the harness measured gdm at 0.0000. Fixed with the structural
 * raw-block carrier (blockRawBytes + blockRows on the variable layout); see
 * variableBlockCarrier.testkit.ts for the asserted invariants.
 */
import { parseGDMFile } from '../GDMParser';
import { describeVariableBlockCarrier } from './variableBlockCarrier.testkit';

describeVariableBlockCarrier('gdm', parseGDMFile);
