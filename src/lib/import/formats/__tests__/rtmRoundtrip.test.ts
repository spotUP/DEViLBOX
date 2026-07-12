/**
 * Regression: RTM (Real Tracker) packs pattern rows with an event-mask/
 * compression scheme — a non-canonical encoding no from-scratch encoder
 * reproduces, so the harness measured rtm at 0.0000. Fixed with the structural
 * raw-block carrier (blockRawBytes + blockRows on the variable layout); see
 * variableBlockCarrier.testkit.ts for the asserted invariants.
 */
import { parseRTMFile } from '../RTMParser';
import { describeVariableBlockCarrier } from './variableBlockCarrier.testkit';

describeVariableBlockCarrier('rtm', parseRTMFile);
