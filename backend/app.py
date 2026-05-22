"""
FastAPI wrapper around the readability leveling loop.

Endpoints:
  POST /score   -> measure a passage (no API key needed)
  POST /level   -> run the measure-and-iterate rewrite loop
  GET  /health  -> liveness + which rewriter keys are present
"""
from __future__ import annotations

import os
from dataclasses import asdict
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

from referee import get_scorer, VocabScorer, SCORERS
from rewriter import get_rewriter, REWRITERS
from target import GradeBandTarget
from loop import run_loop, fidelity_check

app = FastAPI(title="Grade-Level Rewriter", version="0.1.0")

_origins = os.environ.get(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins if o.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class ScoreRequest(BaseModel):
    text: str = Field(min_length=1)
    scorer: str = "multi_formula"


class LevelRequest(BaseModel):
    text: str = Field(min_length=1)
    rewriter: str = "claude"
    scorer: str = "multi_formula"
    low: float = 5.0
    high: float = 6.9
    max_rounds: int = Field(default=4, ge=1, le=8)
    max_pct_difficult: Optional[float] = None
    model: Optional[str] = None


def _round_to_dict(r) -> dict:
    return {
        "n": r.n,
        "text": r.text,
        "grade": r.grade,
        "detail": r.detail,
        "passed": r.passed,
        "feedback": r.feedback,
    }


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "scorers": list(SCORERS),
        "rewriters": list(REWRITERS),
        "keys_present": {
            "anthropic": bool(os.environ.get("ANTHROPIC_API_KEY")),
            "openai": bool(os.environ.get("OPENAI_API_KEY")),
            "gemini": bool(os.environ.get("GEMINI_API_KEY")),
        },
    }


@app.post("/score")
def score(req: ScoreRequest) -> dict:
    try:
        scorer = get_scorer(req.scorer)
    except KeyError as e:
        raise HTTPException(status_code=400, detail=str(e))
    grade = scorer.score(req.text)
    vocab = VocabScorer().score(req.text)
    return {
        "grade": {"value": grade.grade, "method": grade.method, "detail": grade.detail},
        "vocab": {"value": vocab.grade, "method": vocab.method, "detail": vocab.detail},
    }


@app.post("/level")
def level(req: LevelRequest) -> dict:
    if req.rewriter not in REWRITERS:
        raise HTTPException(status_code=400, detail=f"Unknown rewriter '{req.rewriter}'")
    if req.rewriter == "manual":
        raise HTTPException(
            status_code=400,
            detail="The 'manual' rewriter is for the CLI demo and can't be called from the web UI.",
        )

    env_key = {
        "claude": "ANTHROPIC_API_KEY",
        "openai": "OPENAI_API_KEY",
        "gemini": "GEMINI_API_KEY",
    }[req.rewriter]
    if not os.environ.get(env_key):
        raise HTTPException(
            status_code=400,
            detail=f"{env_key} is not set on the server. Add it to backend/.env and restart.",
        )

    kwargs = {"model": req.model} if req.model else {}
    try:
        rw = get_rewriter(req.rewriter, **kwargs)
        scorer = get_scorer(req.scorer)
    except KeyError as e:
        raise HTTPException(status_code=400, detail=str(e))

    target = GradeBandTarget(
        low=req.low, high=req.high, max_pct_difficult=req.max_pct_difficult
    )
    try:
        res = run_loop(
            req.text, rw, target, scorer=scorer, max_rounds=req.max_rounds, verbose=False
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Rewriter call failed: {e}")

    res.fidelity = fidelity_check(req.text, res.rounds[-1].text)
    return {
        "source_grade": res.source_grade,
        "final_grade": res.final_grade,
        "passed": res.passed,
        "n_rounds": res.n_rounds,
        "rounds": [_round_to_dict(r) for r in res.rounds],
        "final_text": res.rounds[-1].text,
        "fidelity": res.fidelity,
        "config": res.config,
    }
