import type { LiveResult } from './targets';
import type { SailOutlook } from './sails';

export type AdviceLevel = 'ok' | 'info' | 'warn' | 'alert';

export interface Advice {
  id: string;
  level: AdviceLevel;
  text: string;
}

export interface AdviceThresholds {
  /** Angle tolerance around the target TWA, degrees. */
  angleTol: number;
  /** Below this fraction of target: slow. */
  slow: number;
  /** Above this fraction of target: fast. */
  fast: number;
  /** Above this fraction: inputs are probably wrong. */
  implausible: number;
}

export const DEFAULT_THRESHOLDS: AdviceThresholds = {
  angleTol: 3,
  slow: 0.95,
  fast: 1.03,
  implausible: 1.2,
};

const r0 = (x: number) => Math.round(x);
const r1 = (x: number) => x.toFixed(1);

/**
 * Rule-based tactical advice in Greek. Deterministic: same inputs → same
 * advice, ordered by severity.
 */
export function adviceFor(
  res: LiveResult,
  sails: SailOutlook & { currentSailId?: string },
  th: AdviceThresholds = DEFAULT_THRESHOLDS,
): Advice[] {
  const out: Advice[] = [];
  const { bsp, pctTarget, mode, twa } = res;

  if (res.tws < 1) {
    out.push({ id: 'calm', level: 'info', text: 'Σχεδόν άπνοια: κράτα το σκάφος να κινείται, ελαφριά ρύθμιση, βάρη μπροστά και υπήνεμα.' });
  }

  if (bsp !== undefined && pctTarget !== undefined && pctTarget > th.implausible) {
    out.push({
      id: 'check-inputs',
      level: 'alert',
      text: `Ταχύτητα ${r0(pctTarget * 100)}% του target: έλεγξε TWS/TWA/BSP (πιθανό λάθος ένδειξης ή ρεύμα).`,
    });
  }

  if (mode === 'upwind' && res.targetTwa !== undefined) {
    const diff = twa - res.targetTwa; // + = sailing lower than target
    if (bsp !== undefined && pctTarget !== undefined) {
      if (diff < -th.angleTol && pctTarget < 1) {
        out.push({ id: 'pinch', level: 'warn', text: `Πολύ ψηλά (${r0(twa)}° vs ${r0(res.targetTwa)}°): πέσε ${r0(-diff)}° και χτίσε ταχύτητα.` });
      } else if (diff > th.angleTol && pctTarget >= 1) {
        out.push({ id: 'low', level: 'warn', text: `Χαμηλά (${r0(twa)}° vs ${r0(res.targetTwa)}°) με ταχύτητα: όρτσαρε ${r0(diff)}°.` });
      } else if (pctTarget < th.slow) {
        out.push({ id: 'slow-up', level: 'warn', text: `Αργός (${r0(pctTarget * 100)}%): πέσε 2–3° για ταχύτητα, άνοιξε λίγο τα πανιά, έλεγξε twist.` });
      } else if (pctTarget > th.fast) {
        out.push({ id: 'fast-up', level: 'info', text: `Πάνω από target (${r0(pctTarget * 100)}%): όρτσαρε 1–2° για καλύτερο VMG.` });
      } else {
        out.push({ id: 'on-target-up', level: 'ok', text: `Στο target: ${r1(res.targetBsp)} kt στις ${r0(res.targetTwa)}°.` });
      }
    } else {
      out.push({ id: 'target-up', level: 'info', text: `Target όρτσα: ${r1(res.targetBsp)} kt στις ${r0(res.targetTwa)}° TWA.` });
    }
  }

  if (mode === 'downwind' && res.targetTwa !== undefined) {
    const diff = twa - res.targetTwa; // + = deeper than target
    if (bsp !== undefined && pctTarget !== undefined) {
      if (diff < -th.angleTol && pctTarget >= 1) {
        out.push({ id: 'high-down', level: 'warn', text: `Ψηλά (${r0(twa)}° vs ${r0(res.targetTwa)}°) με ταχύτητα: πέσε ${r0(-diff)}°.` });
      } else if (diff > th.angleTol && pctTarget < 1) {
        out.push({ id: 'deep-down', level: 'warn', text: `Πολύ βαθιά (${r0(twa)}° vs ${r0(res.targetTwa)}°): όρτσαρε ${r0(diff)}° για πίεση στα πανιά.` });
      } else if (pctTarget < th.slow) {
        out.push({ id: 'slow-down', level: 'warn', text: `Αργός (${r0(pctTarget * 100)}%): όρτσαρε λίγο για να χτίσεις φαινόμενο άνεμο.` });
      } else if (pctTarget > th.fast) {
        out.push({ id: 'fast-down', level: 'info', text: `Πάνω από target (${r0(pctTarget * 100)}%): πέσε βαθύτερα για καλύτερο VMG.` });
      } else {
        out.push({ id: 'on-target-down', level: 'ok', text: `Στο target: ${r1(res.targetBsp)} kt στις ${r0(res.targetTwa)}°.` });
      }
    } else {
      out.push({ id: 'target-down', level: 'info', text: `Target πρύμα: ${r1(res.targetBsp)} kt στις ${r0(res.targetTwa)}° TWA.` });
    }
  }

  if (mode === 'reach' && bsp !== undefined && pctTarget !== undefined) {
    if (pctTarget < th.slow) {
      out.push({ id: 'slow-reach', level: 'warn', text: `Αργός στο reaching (${r0(pctTarget * 100)}%): έλεγξε ρύθμιση πανιών (άνοιξε), βάρη έξω, πανί.` });
    } else if (pctTarget <= th.implausible) {
      out.push({ id: 'ok-reach', level: 'ok', text: `Reaching: ${r0(pctTarget * 100)}% του polar (${r1(res.targetBsp)} kt).` });
    }
  }

  const rec = sails.recommended;
  if (rec && sails.currentSailId && sails.currentSailId !== rec.id) {
    out.push({ id: 'sail-change', level: 'alert', text: `Προτεινόμενο πανί: ${rec.name} (τώρα ${sails.currentSailId}).` });
  }
  if (sails.ifStronger) {
    out.push({ id: 'sail-ready-up', level: 'info', text: `Κοντά στο όριο: ετοίμασε ${sails.ifStronger.name} αν δυναμώσει.` });
  }
  if (sails.ifLighter) {
    out.push({ id: 'sail-ready-down', level: 'info', text: `Κοντά στο όριο: ετοίμασε ${sails.ifLighter.name} αν πέσει ο άνεμος.` });
  }

  const order: Record<AdviceLevel, number> = { alert: 0, warn: 1, info: 2, ok: 3 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}
