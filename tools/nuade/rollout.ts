/**
 * The rows whose verdict is applied to the table. The plan rolled out in waves (wave 1 first: mmdc, robhubbard, timfollin,
 * earache, musicalenlightenment); on 2026-10-13 the owner asked for every format, so the rollout is all rows. A row with
 * no corpus song, or whose songs are not all in the results file, gets no verdict (computeVerdicts) and plays as before.
 */
import { NUADE_FORMAT_LIST, type NuadeFormat } from '../../src/engine/nuade/nuadeFormats';

export const WAVE_1: readonly string[] = ['mmdc', 'robhubbard', 'timfollin', 'earache', 'musicalenlightenment'];

export const rolledOutRows = (): NuadeFormat[] => [...NUADE_FORMAT_LIST];
