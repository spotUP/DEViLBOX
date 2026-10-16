import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { saveModelCosts, loadModelCosts, costFilePath } from './modelCostStore';
import { noteModelCost, noteModelMute, modelIsMute, modelCostMs, modelIsMeasured, flushModelCosts, resetModelCosts, UNTRIED_MS, FAILURE_PENALTY_MS } from './modelCosts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'costs-'));
process.env.DB_DIR = dir;
afterAll(() => { delete process.env.DB_DIR; fs.rmSync(dir, { recursive: true, force: true }); });
beforeEach(() => { resetModelCosts(); fs.rmSync(costFilePath(), { force: true }); });

describe('modelCostStore (FA-1)', () => {
  it('round-trips and survives a missing or corrupt file', () => {
    expect(loadModelCosts().size).toBe(0);
    saveModelCosts(new Map([['m', { ewmaMs: 1200, mute: true }]]));
    expect(loadModelCosts().get('m')).toEqual({ ewmaMs: 1200, mute: true });
    fs.writeFileSync(costFilePath(), '{not json');
    expect(loadModelCosts().size).toBe(0);
  });
});

describe('modelCosts (FA-2)', () => {
  it('untried is optimistic, EWMA is prev*0.6+ms*0.4, failure adds a penalty', () => {
    expect(modelCostMs('x')).toBe(UNTRIED_MS);
    expect(modelIsMeasured('x')).toBe(false);
    noteModelCost('x', 1000, true);
    noteModelCost('x', 2000, true);
    expect(modelCostMs('x')).toBeCloseTo(1000 * 0.6 + 2000 * 0.4, 5);
    noteModelCost('y', 1000, false, 5000);
    expect(modelCostMs('y', 5000)).toBeGreaterThanOrEqual(FAILURE_PENALTY_MS);
  });
  it('mute is sticky and persists through a flush', () => {
    noteModelMute('m', true);
    expect(modelIsMute('m')).toBe(true);
    noteModelCost('m', 100, true);
    expect(modelIsMute('m')).toBe(true);
    flushModelCosts();
    expect(loadModelCosts().get('m')?.mute).toBe(true);
  });
});
