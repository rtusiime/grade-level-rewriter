#!/usr/bin/env python3
"""
CLI for the readability leveling loop.

Two modes:
  1) SCORE only (no API key needed) -- just measure a file's reading level:
        python run.py score --in passage.txt --scorer multi_formula

  2) LEVEL -- rewrite to a target grade with the measure-and-iterate loop:
        export ANTHROPIC_API_KEY=sk-...
        python run.py level --in passage.txt --rewriter claude \
            --low 5 --high 7 --max-rounds 4 --out leveled.txt

Swap any component from the command line -- that's the A/B-testing surface:
  --rewriter   manual | claude | openai | gemini
  --scorer     flesch_kincaid | multi_formula
  --low/--high target grade band   --max-difficult cap on % hard words
Every level run appends a row to ab_test_log.csv so you can compare configs.
"""
import argparse, sys, os
from referee import get_scorer, VocabScorer
from rewriter import get_rewriter
from target import GradeBandTarget
from loop import run_loop, fidelity_check, log_result


def main():
    p = argparse.ArgumentParser(description="Readability leveling loop")
    sub = p.add_subparsers(dest="cmd", required=True)

    sc = sub.add_parser("score", help="measure reading level only")
    sc.add_argument("--in", dest="infile", required=True)
    sc.add_argument("--scorer", default="multi_formula")

    lv = sub.add_parser("level", help="rewrite to target grade with the loop")
    lv.add_argument("--in", dest="infile", required=True)
    lv.add_argument("--out", dest="outfile", default=None)
    lv.add_argument("--rewriter", default="claude")
    lv.add_argument("--scorer", default="multi_formula")
    lv.add_argument("--low", type=float, default=5.0)
    lv.add_argument("--high", type=float, default=7.0)
    lv.add_argument("--max-difficult", type=float, default=None,
                    help="optional cap on fraction of difficult words, e.g. 0.20")
    lv.add_argument("--max-rounds", type=int, default=4)
    lv.add_argument("--model", default=None, help="override model name")
    lv.add_argument("--log", default="ab_test_log.csv")
    lv.add_argument("--label", default="")

    args = p.parse_args()
    text = open(args.infile, encoding="utf-8").read()

    if args.cmd == "score":
        s = get_scorer(args.scorer)
        print(s.score(text))
        print(VocabScorer().score(text))
        return

    # level
    kwargs = {"model": args.model} if args.model else {}
    try:
        rw = get_rewriter(args.rewriter, **kwargs)
    except KeyError as e:
        sys.exit(str(e))
    target = GradeBandTarget(low=args.low, high=args.high,
                             max_pct_difficult=args.max_difficult)
    res = run_loop(text, rw, target, scorer=get_scorer(args.scorer),
                   max_rounds=args.max_rounds, verbose=True)
    res.fidelity = fidelity_check(text, res.rounds[-1].text)
    log_result(res, args.log, label=args.label or os.path.basename(args.infile))
    print("="*60)
    print(f"passed={res.passed}  {res.source_grade:.1f} -> {res.final_grade:.1f} "
          f"in {res.n_rounds} rounds   (logged to {args.log})")
    if args.outfile:
        open(args.outfile, "w", encoding="utf-8").write(res.rounds[-1].text)
        print("final text written to", args.outfile)
    else:
        print("\n--- FINAL TEXT ---\n" + res.rounds[-1].text)


if __name__ == "__main__":
    main()
