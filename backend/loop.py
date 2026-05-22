"""
Loop = the orchestrator that turns a one-shot LLM rewrite (relative, unreliable)
into a standardized, on-target result (absolute, reproducible).

    source --> [Rewriter] --> draft --> [Referee measures] --> in target?
                  ^                                                |
                  |____________ feedback (measured grade) <________| (if no)

Also runs an optional fidelity check so you can see whether simplification is
dropping information. Every run is logged to a CSV row so you can A/B test
configs (model / prompt / target / scorer) against how classes actually go.
"""

from __future__ import annotations
import csv, os, time
from dataclasses import dataclass, field, asdict
from typing import Optional

from referee import get_scorer, MultiFormulaScorer, VocabScorer
from target import GradeBandTarget


@dataclass
class Round:
    n: int
    text: str
    grade: float
    detail: dict
    passed: bool
    feedback: str


@dataclass
class LevelingResult:
    source_grade: float
    final_grade: float
    rounds: list
    passed: bool
    config: dict
    fidelity: Optional[dict] = None

    @property
    def n_rounds(self) -> int:
        return len(self.rounds)


def run_loop(source_text: str,
             rewriter,
             target: GradeBandTarget,
             scorer=None,
             vocab_scorer=None,
             max_rounds: int = 4,
             verbose: bool = True) -> LevelingResult:
    """Core measure-and-iterate loop. `rewriter` is any object with
    .rewrite(text, target_desc, feedback) -> str."""
    scorer = scorer or MultiFormulaScorer()
    vocab_scorer = vocab_scorer or VocabScorer()

    src = scorer.score(source_text)
    if verbose:
        print(f"SOURCE: {src}")
        print(f"TARGET: {target.description}\n")

    rounds: list[Round] = []
    feedback = None
    current = source_text

    for i in range(1, max_rounds + 1):
        draft = rewriter.rewrite(source_text, target.description, feedback)
        sc = scorer.score(draft)
        vc = vocab_scorer.score(draft)
        passed, fb = target.check(sc.grade, pct_difficult=vc.detail["pct_difficult_words"])
        rounds.append(Round(i, draft, sc.grade, sc.detail, passed, fb))
        if verbose:
            print(f"--- round {i} ---")
            print(f"  measured: {sc}")
            print(f"  vocab: {vc.detail['pct_difficult_words']:.0f}% difficult words")
            print(f"  verdict: {fb}\n")
        current = draft
        feedback = fb
        if passed:
            break

    return LevelingResult(
        source_grade=src.grade,
        final_grade=rounds[-1].grade,
        rounds=rounds,
        passed=rounds[-1].passed,
        config={"rewriter": getattr(rewriter, "name", "?"),
                "scorer": scorer.name,
                "target": f"{target.low}-{target.high}",
                "max_rounds": max_rounds},
    )


def fidelity_check(source: str, rewrite: str, judge_rewriter=None) -> dict:
    """Optional: how much meaning survived? Cheap proxy + room for an LLM judge.
    The proxy is crude (content-word overlap); for real validation, plug an LLM
    judge in via judge_rewriter or a dedicated comprehension-question step."""
    import re
    def content_words(t):
        stop = set("the a an and or but of to in on at for with as is are was were "
                   "be been being it its this that these those by from we you they "
                   "he she i not no can will would could should has have had do does "
                   "did so if then than which who whom whose".split())
        return {w for w in re.findall(r"[a-z]+", t.lower()) if w not in stop and len(w) > 2}
    s, r = content_words(source), content_words(rewrite)
    kept = len(s & r) / max(len(s), 1)
    return {"content_word_retention": round(kept, 3),
            "source_unique_terms": len(s),
            "rewrite_unique_terms": len(r),
            "note": "Crude lexical proxy. Low retention can be fine (synonyms) "
                    "or bad (dropped facts) -- use an LLM judge for real fidelity."}


def log_result(result: LevelingResult, path: str, label: str = ""):
    """Append one row per run so you can compare configs over a semester."""
    row = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "label": label,
        "rewriter": result.config["rewriter"],
        "scorer": result.config["scorer"],
        "target": result.config["target"],
        "source_grade": round(result.source_grade, 2),
        "final_grade": round(result.final_grade, 2),
        "n_rounds": result.n_rounds,
        "passed": result.passed,
        "fidelity_retention": (result.fidelity or {}).get("content_word_retention", ""),
    }
    new = not os.path.exists(path)
    with open(path, "a", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(row))
        if new:
            w.writeheader()
        w.writerow(row)
    return path
