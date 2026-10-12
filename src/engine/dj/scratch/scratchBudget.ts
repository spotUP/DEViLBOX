/**
 * Performance budget (owner plan `thoughts/shared/plans/2026-10-08-dj-view-scratch-plan.md`
 * section 55; ledger SCR-P6.8): the creative activity of the set - scratch, juggle, FX and
 * transition energy - on one 0-100 scale with four bands, falling back toward zero after a
 * feature (-10 per bar). The Auto DJ feeds its juggles, FX and transitions in (P7); the
 * scratch controller feeds its own phrases and reads the band.
 */

import { MODE_MAX_LEVEL, type ScratchMode } from './scratchStyles';

export type BudgetKind = 'scratch' | 'juggle' | 'fx' | 'transition';
export type BudgetBand = 'normal' | 'occasional' | 'performance' | 'feature';

/** Section 55 bands: 0-25 normal DJ, 25-50 occasional scratch, 50-75 performance, 75-100 feature/battle. */
export function budgetBand(total: number): BudgetBand {
  if (total < 25) return 'normal';
  if (total < 50) return 'occasional';
  if (total < 75) return 'performance';
  return 'feature';
}

export const FEATURE_BUDGET = 75;
export const BUDGET_DECAY_PER_BAR = 10;

export class PerformanceBudget {
  private energy: Record<BudgetKind, number> = { scratch: 0, juggle: 0, fx: 0, transition: 0 };

  get total(): number {
    return Math.min(100, this.energy.scratch + this.energy.juggle + this.energy.fx + this.energy.transition);
  }
  get band(): BudgetBand { return budgetBand(this.total); }
  get parts(): Readonly<Record<BudgetKind, number>> { return { ...this.energy }; }

  add(kind: BudgetKind, amount: number): void {
    this.energy[kind] = Math.max(0, this.energy[kind] + amount);
    const over = this.energy.scratch + this.energy.juggle + this.energy.fx + this.energy.transition - 100;
    if (over > 0) this.energy[kind] = Math.max(0, this.energy[kind] - over);
  }

  /** A feature (section 55 "feature/battle"): the scratch energy lifts the total to at least 75. */
  feature(): void {
    if (this.total < FEATURE_BUDGET) this.add('scratch', FEATURE_BUDGET - this.total);
  }

  /** One bar passed: the total falls 10 toward zero, taken from each kind in proportion. */
  tickBar(bars = 1): void {
    for (let i = 0; i < bars; i++) {
      const total = this.total;
      if (total <= 0) return;
      const k = Math.max(0, total - BUDGET_DECAY_PER_BAR) / total;
      for (const key of Object.keys(this.energy) as BudgetKind[]) this.energy[key] *= k;
    }
  }
}

// ─── Peak performance mode (section 56; ledger SCR-P6.9) ─────────────────

/** What the moment allows the performer (the safety governor still checks every request). */
export interface PerformancePermissions {
  peak: boolean;
  maxLevel: 0 | 1 | 2 | 3 | 4;
  /** Subdivisions a gesture may be placed on (1/32 still per gesture: `allowedGrids`). */
  grids: ReadonlyArray<'1/8' | '1/16' | '1/32'>;
  juggle: boolean;
  doubles: boolean;
  callResponse: boolean;
  throws: boolean;
  reason: string;
}

/**
 * Section 56: at a true set peak (set phase PEAK with the budget in its feature band, >= 75) a
 * PERFORMER or BATTLE performer may use the advanced gestures (level 4: orbit, crab, the flares),
 * 1/32 subdivisions, juggles, doubles, call-response and throws. Outside the peak - or in a
 * restrained mode (OFF, SAFE, MUSICAL) - the mode's own level and the 1/16 grid stand.
 */
export function performancePermissions(opts: { setPhase: string; budgetTotal: number; mode: ScratchMode }): PerformancePermissions {
  const level = MODE_MAX_LEVEL[opts.mode];
  const peak = opts.setPhase === 'PEAK' && opts.budgetTotal >= FEATURE_BUDGET && (opts.mode === 'PERFORMER' || opts.mode === 'BATTLE');
  if (peak) {
    return { peak, maxLevel: 4, grids: ['1/8', '1/16', '1/32'], juggle: true, doubles: true, callResponse: true, throws: true, reason: `set peak, budget ${opts.budgetTotal.toFixed(0)}: peak performance` };
  }
  return {
    peak, maxLevel: level, grids: ['1/8', '1/16'], juggle: level >= 3, doubles: level >= 3, callResponse: level >= 2, throws: level >= 2,
    reason: opts.setPhase === 'PEAK' ? `set peak but budget ${opts.budgetTotal.toFixed(0)} < ${FEATURE_BUDGET} or mode ${opts.mode}` : `${opts.mode} outside the peak`,
  };
}
