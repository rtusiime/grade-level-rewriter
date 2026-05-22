import { useEffect, useState } from "react";
import "./App.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

type ScoreResponse = {
  grade: { value: number; method: string; detail: Record<string, number> };
  vocab: { value: number; method: string; detail: Record<string, number> };
};

type Round = {
  n: number;
  text: string;
  grade: number;
  detail: Record<string, number>;
  passed: boolean;
  feedback: string;
};

type LevelResponse = {
  source_grade: number;
  final_grade: number;
  passed: boolean;
  n_rounds: number;
  rounds: Round[];
  final_text: string;
  fidelity: { content_word_retention: number; note: string } & Record<string, unknown>;
  config: Record<string, unknown>;
};

type Health = {
  ok: boolean;
  scorers: string[];
  rewriters: string[];
  keys_present: { anthropic: boolean; openai: boolean; gemini: boolean };
};

const SAMPLE = `The epistemological ramifications of quantum indeterminacy necessitate a fundamental reconceptualization of the deterministic paradigms that had hitherto characterized classical mechanics, insofar as the observer is no longer construed as an ontologically detached spectator but rather as a constitutive participant in the phenomenological actualization of measurable outcomes.`;

export default function App() {
  const [text, setText] = useState(SAMPLE);
  const [rewriter, setRewriter] = useState("claude");
  const [scorer, setScorer] = useState("multi_formula");
  const [low, setLow] = useState(5);
  const [high, setHigh] = useState(7);
  const [maxRounds, setMaxRounds] = useState(4);
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [score, setScore] = useState<ScoreResponse | null>(null);
  const [result, setResult] = useState<LevelResponse | null>(null);
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    fetch(`${API}/health`)
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  async function call<T>(path: string, body: unknown): Promise<T> {
    const r = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const detail = await r.json().catch(() => ({ detail: r.statusText }));
      throw new Error(detail.detail || `HTTP ${r.status}`);
    }
    return r.json();
  }

  async function onScore() {
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      setScore(await call<ScoreResponse>("/score", { text, scorer }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onLevel() {
    setBusy(true);
    setErr(null);
    setScore(null);
    try {
      setResult(
        await call<LevelResponse>("/level", {
          text,
          rewriter,
          scorer,
          low,
          high,
          max_rounds: maxRounds,
          model: model || undefined,
        }),
      );
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const keyMissing =
    health && rewriter !== "manual" &&
    !(health.keys_present as Record<string, boolean>)[
      rewriter === "claude" ? "anthropic" : rewriter
    ];

  return (
    <div className="app">
      <header>
        <h1>Grade-Level Rewriter</h1>
        <p className="sub">
          Score a reading passage, or rewrite it to a target grade band with a
          measure-and-iterate loop.
        </p>
      </header>

      <section className="panel">
        <label className="block">
          <span>Passage</span>
          <textarea
            rows={10}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste a reading passage..."
          />
        </label>

        <div className="row">
          <label>
            <span>Rewriter</span>
            <select value={rewriter} onChange={(e) => setRewriter(e.target.value)}>
              <option value="claude">Claude</option>
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
            </select>
          </label>
          <label>
            <span>Scorer</span>
            <select value={scorer} onChange={(e) => setScorer(e.target.value)}>
              <option value="multi_formula">multi_formula (recommended)</option>
              <option value="flesch_kincaid">flesch_kincaid</option>
            </select>
          </label>
          <label>
            <span>Grade band</span>
            <div className="band">
              <input
                type="number"
                min={1}
                max={16}
                step={0.5}
                value={low}
                onChange={(e) => setLow(parseFloat(e.target.value))}
              />
              <span>–</span>
              <input
                type="number"
                min={1}
                max={16}
                step={0.5}
                value={high}
                onChange={(e) => setHigh(parseFloat(e.target.value))}
              />
            </div>
          </label>
          <label>
            <span>Max rounds</span>
            <input
              type="number"
              min={1}
              max={8}
              value={maxRounds}
              onChange={(e) => setMaxRounds(parseInt(e.target.value))}
            />
          </label>
          <label className="grow">
            <span>Model (optional)</span>
            <input
              type="text"
              value={model}
              placeholder="e.g. claude-opus-4-7, gpt-4o, gemini-2.0-flash"
              onChange={(e) => setModel(e.target.value)}
            />
          </label>
        </div>

        {keyMissing && (
          <div className="warn">
            No API key for <code>{rewriter}</code> on the server. Add it to{" "}
            <code>backend/.env</code> and restart — <code>/score</code> still works.
          </div>
        )}

        <div className="actions">
          <button onClick={onScore} disabled={busy || !text.trim()}>
            Score only
          </button>
          <button className="primary" onClick={onLevel} disabled={busy || !text.trim()}>
            {busy ? "Working…" : "Level to band"}
          </button>
        </div>
      </section>

      {err && <div className="error">Error: {err}</div>}

      {score && <ScoreView s={score} />}

      {result && <LevelView r={result} />}

      <footer>
        <small>
          API: <code>{API}</code> {health?.ok ? "· connected" : "· not reachable"}
        </small>
      </footer>
    </div>
  );
}

function ScoreView({ s }: { s: ScoreResponse }) {
  return (
    <section className="panel">
      <h2>Score</h2>
      <p>
        <strong>Grade ({s.grade.method}):</strong> {s.grade.value.toFixed(1)}
        {" · "}
        <strong>Difficult words:</strong>{" "}
        {s.vocab.detail.pct_difficult_words.toFixed(0)}%
      </p>
      <details>
        <summary>Per-formula detail</summary>
        <pre>{JSON.stringify(s.grade.detail, null, 2)}</pre>
      </details>
    </section>
  );
}

function LevelView({ r }: { r: LevelResponse }) {
  return (
    <section className="panel">
      <h2>Leveling result</h2>
      <p>
        <span className={r.passed ? "pill ok" : "pill fail"}>
          {r.passed ? "passed" : "did not converge"}
        </span>{" "}
        source <strong>{r.source_grade.toFixed(1)}</strong> →{" "}
        final <strong>{r.final_grade.toFixed(1)}</strong> in {r.n_rounds} round
        {r.n_rounds === 1 ? "" : "s"}{" "}
        · fidelity {(r.fidelity.content_word_retention * 100).toFixed(0)}%
      </p>

      <h3>Final text</h3>
      <pre className="final">{r.final_text}</pre>

      <h3>Rounds</h3>
      <ol className="rounds">
        {r.rounds.map((rd) => (
          <li key={rd.n}>
            <div className="round-head">
              <strong>Round {rd.n}</strong>
              <span className={rd.passed ? "pill ok" : "pill fail"}>
                grade {rd.grade.toFixed(1)}
              </span>
            </div>
            <p className="feedback">{rd.feedback}</p>
            <details>
              <summary>Show this round&rsquo;s text</summary>
              <pre>{rd.text}</pre>
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}
