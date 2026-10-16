import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { rankFreeModels, requestedModelIfFree, primeModelCatalogue, resetModelCatalogue, isFreeModel, type OpenRouterModel } from './freeModels';
import { noteModelCost, noteModelMute, resetModelCosts } from './modelCosts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-'));
process.env.DB_DIR = dir;
afterAll(() => { delete process.env.DB_DIR; fs.rmSync(dir, { recursive: true, force: true }); });
beforeEach(() => { resetModelCosts(); resetModelCatalogue(); });

const free = (id: string, ctx: number, tools = true): OpenRouterModel => ({
  id, context_length: ctx, pricing: { prompt: '0', completion: '0' }, supported_parameters: tools ? ['tools'] : [],
});

describe('free model ranking (FA-3)', () => {
  it('filters paid models and thinking models', () => {
    const ranked = rankFreeModels([free('a:free', 1000), { ...free('p', 1000), pricing: { prompt: '0.1', completion: '0.1' } }, free('x-think:free', 1000)]);
    expect(ranked).toEqual(['a:free']);
    expect(isFreeModel({ id: 'p', pricing: { prompt: '1', completion: '0' } })).toBe(false);
  });
  it('tool support beats everything; untried ties go to the smaller context', () => {
    expect(rankFreeModels([free('notools', 100, false), free('big', 9000), free('small', 1000)])).toEqual(['small', 'big', 'notools']);
  });
  it('a mute model sinks below a slow one; a fast one rises', () => {
    noteModelMute('fast', true);
    noteModelCost('slow', 20000, true);
    expect(rankFreeModels([free('fast', 1000), free('slow', 1000)])).toEqual(['slow', 'fast']);
  });
  it('a requested paid or unknown id is refused, a free catalogue id is accepted', () => {
    primeModelCatalogue([free('a:free', 1000), { ...free('paid', 1000), pricing: { prompt: '1', completion: '1' } }]);
    expect(requestedModelIfFree('paid')).toBeNull();
    expect(requestedModelIfFree('nope')).toBeNull();
    expect(requestedModelIfFree('a:free')).toBe('a:free');
  });
});
