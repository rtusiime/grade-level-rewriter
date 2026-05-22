export type GradeBandTarget = {
  low: number;
  high: number;
  maxPctDifficult?: number;
};

export function describeTarget(t: GradeBandTarget): string {
  return (
    `a ${t.low.toFixed(0)}th-${t.high.toFixed(0)}th grade student can read it ` +
    `(target reading-grade level between ${t.low} and ${t.high})`
  );
}

export function checkTarget(
  t: GradeBandTarget,
  grade: number,
  pctDifficult?: number,
): { passed: boolean; feedback: string } {
  if (grade < t.low) {
    return {
      passed: false,
      feedback:
        `Your rewrite measured grade ${grade.toFixed(1)}, which is BELOW the ` +
        `target band ${t.low}-${t.high}. It may be over-simplified or losing nuance — ` +
        `you can use slightly richer sentences.`,
    };
  }
  if (grade > t.high) {
    return {
      passed: false,
      feedback:
        `Your rewrite measured grade ${grade.toFixed(1)}, which is ABOVE the ` +
        `target band ${t.low}-${t.high}. Shorten sentences further and replace ` +
        `harder words with simpler ones.`,
    };
  }
  if (t.maxPctDifficult != null && pctDifficult != null) {
    const cap = t.maxPctDifficult * 100;
    if (pctDifficult > cap) {
      return {
        passed: false,
        feedback:
          `Grade ${grade.toFixed(1)} is in band, but ${pctDifficult.toFixed(0)}% of ` +
          `words are 'difficult' (cap is ${cap.toFixed(0)}%). Swap remaining ` +
          `hard/abstract words for concrete everyday ones.`,
      };
    }
  }
  return {
    passed: true,
    feedback: `On target: grade ${grade.toFixed(1)} within ${t.low}-${t.high}.`,
  };
}
