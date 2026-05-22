import { multiFormulaScore, vocabScore, type ScoreResult } from "./readability";
import { checkTarget, describeTarget, type GradeBandTarget } from "./target";
import { rewrite, type Provider } from "./rewriters";

export type Round = {
  n: number;
  text: string;
  grade: number;
  detail: Record<string, number>;
  passed: boolean;
  feedback: string;
};

export type LevelingResult = {
  sourceGrade: number;
  finalGrade: number;
  passed: boolean;
  rounds: Round[];
  finalText: string;
  fidelity: { contentWordRetention: number; sourceUniqueTerms: number; rewriteUniqueTerms: number };
  config: { provider: Provider; model: string; target: string };
};

export type RunLoopOpts = {
  text: string;
  target: GradeBandTarget;
  provider: Provider;
  apiKey: string;
  model?: string;
  maxRounds: number;
  scorer?: (text: string) => ScoreResult;
  onRound?: (r: Round) => void;
};

export async function runLoop(opts: RunLoopOpts): Promise<LevelingResult> {
  const scorer = opts.scorer || multiFormulaScore;
  const source = scorer(opts.text);
  const targetDesc = describeTarget(opts.target);

  const rounds: Round[] = [];
  let feedback: string | null = null;

  for (let i = 1; i <= opts.maxRounds; i++) {
    const draft = await rewrite(
      opts.provider,
      opts.text,
      targetDesc,
      feedback,
      opts.apiKey,
      opts.model,
    );
    const sc = scorer(draft);
    const vc = vocabScore(draft);
    const { passed, feedback: fb } = checkTarget(opts.target, sc.grade, vc.pctDifficultWords);
    const round: Round = {
      n: i,
      text: draft,
      grade: sc.grade,
      detail: sc.detail,
      passed,
      feedback: fb,
    };
    rounds.push(round);
    opts.onRound?.(round);
    feedback = fb;
    if (passed) break;
  }

  const last = rounds[rounds.length - 1];
  return {
    sourceGrade: source.grade,
    finalGrade: last.grade,
    passed: last.passed,
    rounds,
    finalText: last.text,
    fidelity: fidelityCheck(opts.text, last.text),
    config: {
      provider: opts.provider,
      model: opts.model || "default",
      target: `${opts.target.low}-${opts.target.high}`,
    },
  };
}

const STOP = new Set(
  ("the a an and or but of to in on at for with as is are was were be been being it its " +
    "this that these those by from we you they he she i not no can will would could should " +
    "has have had do does did so if then than which who whom whose"
  ).split(" "),
);

function contentWords(t: string): Set<string> {
  const out = new Set<string>();
  for (const m of t.toLowerCase().matchAll(/[a-z]+/g)) {
    const w = m[0];
    if (w.length > 2 && !STOP.has(w)) out.add(w);
  }
  return out;
}

export function fidelityCheck(source: string, rewriteText: string) {
  const s = contentWords(source);
  const r = contentWords(rewriteText);
  let overlap = 0;
  for (const w of s) if (r.has(w)) overlap++;
  return {
    contentWordRetention: Math.round((overlap / Math.max(s.size, 1)) * 1000) / 1000,
    sourceUniqueTerms: s.size,
    rewriteUniqueTerms: r.size,
  };
}
