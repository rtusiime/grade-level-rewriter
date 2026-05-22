import ts from "text-readability";

export type ScoreResult = {
  grade: number;
  detail: Record<string, number>;
  method: string;
};

// SMOG needs many sentences to be meaningful; for short text it returns 0
// which would drag down the average. Drop any non-positive grade values
// from the average — matches the spirit of the Python NaN-drop.
function avg(vals: number[]): number {
  const ok = vals.filter((v) => Number.isFinite(v) && v > 0);
  if (!ok.length) return NaN;
  return ok.reduce((a, b) => a + b, 0) / ok.length;
}

export function multiFormulaScore(text: string): ScoreResult {
  const detail: Record<string, number> = {
    fk_grade: ts.fleschKincaidGrade(text),
    gunning_fog: ts.gunningFog(text),
    smog: ts.smogIndex(text),
    coleman_liau: ts.colemanLiauIndex(text),
    ari: ts.automatedReadabilityIndex(text),
    linsear_write: ts.linsearWriteFormula(text),
  };
  const grade = avg(Object.values(detail));
  detail.flesch_ease = ts.fleschReadingEase(text);
  return { grade, detail, method: "multi_formula" };
}

export function fleschKincaidScore(text: string): ScoreResult {
  const fk = ts.fleschKincaidGrade(text);
  return {
    grade: fk,
    detail: { fk_grade: fk, flesch_ease: ts.fleschReadingEase(text) },
    method: "flesch_kincaid",
  };
}

export type VocabResult = {
  pctDifficultWords: number;
  nDifficult: number;
  nWords: number;
};

export function vocabScore(text: string): VocabResult {
  const nWords = Math.max(ts.lexiconCount(text, true), 1);
  const nDifficult = ts.difficultWords(text);
  return {
    pctDifficultWords: (100 * nDifficult) / nWords,
    nDifficult,
    nWords,
  };
}

export type ScorerName = "multi_formula" | "flesch_kincaid";

export function getScorer(name: ScorerName): (text: string) => ScoreResult {
  return name === "flesch_kincaid" ? fleschKincaidScore : multiFormulaScore;
}
