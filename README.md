# Grade-Level Rewriter

A small web app that takes a reading passage and **proves** it has been rewritten to a target grade band — using a closed loop between an LLM rewriter and an objective `textstat` referee.

The core insight (from Skalbeck, 2023): one-shot LLM rewrites anchor on the **source** text and hit a target only in relative terms — the same instruction can produce grade 4.9, 10.0, 4.6, 6.9 from near-identical drafts. The fix is a feedback loop: the LLM rewrites, formulas measure, the measured grade is fed back as an **absolute** target, repeat until the text lands in band.

```
source → [Rewriter / LLM] → draft → [Referee / textstat] → in band?
            ^                                                 |
            |________ feedback: "you measured 8.2, too high" _|
```

## Repo layout

```
backend/    FastAPI wrapping the original Python tool (score + leveling loop)
frontend/   React + Vite UI (paste passage, pick band/rewriter, see rounds)
```

The backend's Python modules (`referee.py`, `rewriter.py`, `target.py`, `loop.py`, `run.py`) are the original CLI tool, unchanged. The web layer is a thin wrapper.

## Run locally

### Backend

```bash
cd backend
python3.13 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY as needed
uvicorn app:app --reload --port 8000
```

`/score` works with no API keys. `/level` needs the key for whichever rewriter you choose.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. If your backend runs anywhere other than `http://localhost:8000`, set `VITE_API_URL` in `frontend/.env.local`.

### CLI (original tool, still works)

```bash
cd backend
source .venv/bin/activate
python run.py score --in sample_passage.txt
python run.py level --in sample_passage.txt --rewriter claude --low 5 --high 7
```

## Deploying

GitHub Pages serves **static** sites only — it can host the built React bundle, but the FastAPI backend has to live elsewhere. Two reasonable paths:

1. **Frontend on Pages, backend on Render/Fly/Railway.** Build the frontend with `VITE_API_URL` pointing at the deployed backend.
2. **Both on a single host** (Render works well). The backend serves the API; the React bundle is served as static files or from a separate service on the same host.

Either way, set your API keys as environment variables on the backend host — never commit them.

## Important caveats (from the original tool, still apply)

- **Formulas are gameable.** FK / SMOG only count sentence length and syllables. Short sentences of short words can still be conceptually hard. Treat the grade as necessary, not sufficient — keep a human eye on abstract concepts.
- **Use a band, not a knife edge.** 5.0–7.0 with tolerance, not "exactly 6.0" — small wording changes swing the formulas hard near the target.
- **Fidelity is the real risk.** The built-in content-word retention is a crude proxy; synonyms aren't counted, so low retention can be fine *or* bad. For real validation add an LLM fidelity judge.
- **Lexile ≠ FK.** If your school reports Lexile, FK grade is a proxy — map your Lexile band to an FK band.
