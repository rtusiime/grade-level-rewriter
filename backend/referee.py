"""
Referee = the OBJECTIVE, deterministic measurement layer.

This is the "standardized backbone" of the leveling loop. Unlike asking an
LLM "what grade is this?", these formulas return the same number every time
for the same text, which is what makes A/B testing meaningful.

IMPORTANT CAVEAT (read this): classic formulas (Flesch-Kincaid, SMOG, etc.)
only look at SURFACE features -- sentence length and syllable/letter counts.
They can be GAMED: an LLM can produce short sentences with short words that
are still conceptually hard ("The juxtaposition was stark."). FK will call
that 4th grade. That is why the harness also supports a VocabScorer and an
optional LLM-based comprehension check -- never trust a single surface metric
as proof a 5th grader can actually read something.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Callable, Dict, List
import textstat


# ---------------------------------------------------------------------------
# A Scorer takes raw text and returns a dict of named readability metrics.
# Different Scorers are SWAPPABLE -- this is one of the A/B testing axes.
# ---------------------------------------------------------------------------

@dataclass
class ScoreResult:
    grade: float                 # the single "actual grade level" estimate
    detail: Dict[str, float]     # all underlying metrics, for transparency
    method: str                  # which scorer produced this

    def __str__(self) -> str:
        d = ", ".join(f"{k}={v:.1f}" for k, v in self.detail.items())
        return f"[{self.method}] grade={self.grade:.1f}  ({d})"


class FleschKincaidScorer:
    """Single-formula referee. Closest to what most 'reading level' tools report.
    Fast and familiar, but the most gameable. Good baseline."""
    name = "flesch_kincaid"

    def score(self, text: str) -> ScoreResult:
        fk = textstat.flesch_kincaid_grade(text)
        ease = textstat.flesch_reading_ease(text)
        return ScoreResult(grade=fk, detail={"fk_grade": fk, "flesch_ease": ease},
                           method=self.name)


class MultiFormulaScorer:
    """Robust referee: averages several grade-level formulas so no single
    surface trick dominates. Harder to game than FK alone. Recommended default
    for the referee role."""
    name = "multi_formula"

    def __init__(self, formulas: List[str] | None = None):
        # each entry: (label, callable returning a GRADE-LEVEL number)
        all_formulas = {
            "fk_grade":      textstat.flesch_kincaid_grade,
            "gunning_fog":   textstat.gunning_fog,
            "smog":          textstat.smog_index,
            "coleman_liau":  textstat.coleman_liau_index,
            "ari":           textstat.automated_readability_index,
            "linsear_write": textstat.linsear_write_formula,
        }
        self.formulas = {k: all_formulas[k] for k in (formulas or all_formulas)}

    def score(self, text: str) -> ScoreResult:
        detail = {}
        for label, fn in self.formulas.items():
            try:
                detail[label] = float(fn(text))
            except Exception:
                detail[label] = float("nan")
        vals = [v for v in detail.values() if v == v]  # drop NaN
        grade = sum(vals) / len(vals) if vals else float("nan")
        detail["flesch_ease"] = textstat.flesch_reading_ease(text)
        return ScoreResult(grade=grade, detail=detail, method=self.name)


# A tiny built-in word-difficulty check. Not a substitute for human judgment,
# but it catches the "short sentence / hard word" gaming that FK misses.
class VocabScorer:
    """Flags the share of 'difficult words' (textstat's dictionary heuristic).
    Use ALONGSIDE a grade scorer, not instead of it."""
    name = "vocab_difficulty"

    def score(self, text: str) -> ScoreResult:
        n_words = max(textstat.lexicon_count(text, removepunct=True), 1)
        n_hard = textstat.difficult_words(text)
        pct = 100.0 * n_hard / n_words
        # express as a pseudo-grade so it can share the same plumbing if wanted
        return ScoreResult(grade=pct, detail={"pct_difficult_words": pct,
                                              "n_difficult": float(n_hard),
                                              "n_words": float(n_words)},
                           method=self.name)


SCORERS = {
    "flesch_kincaid": FleschKincaidScorer,
    "multi_formula": MultiFormulaScorer,
    "vocab_difficulty": VocabScorer,
}


def get_scorer(name: str):
    if name not in SCORERS:
        raise KeyError(f"Unknown scorer '{name}'. Options: {list(SCORERS)}")
    return SCORERS[name]()


if __name__ == "__main__":
    college = (
        "The epistemological ramifications of quantum indeterminacy necessitate "
        "a fundamental reconceptualization of the deterministic paradigms that "
        "had hitherto characterized classical mechanics, insofar as the observer "
        "is no longer construed as an ontologically detached spectator but rather "
        "as a constitutive participant in the phenomenological actualization of "
        "measurable outcomes."
    )
    kid = (
        "When you measure a tiny thing, you change it. So you cannot just watch "
        "and stay out of the way. Looking is part of what happens. This was a "
        "big surprise to scientists."
    )
    for label, txt in [("COLLEGE", college), ("KID", kid)]:
        print(f"\n=== {label} ===")
        for s in (MultiFormulaScorer(), FleschKincaidScorer(), VocabScorer()):
            print(" ", s.score(txt))
