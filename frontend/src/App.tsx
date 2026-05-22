import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { getScorer, vocabScore, type ScorerName } from "./lib/readability";
import { runLoop, type LevelingResult, type Round } from "./lib/loop";
import {
  DEFAULT_MODELS,
  PROVIDER_KEY_LABEL,
  PROVIDER_KEY_LINK,
  type Provider,
} from "./lib/rewriters";

const SAMPLE = `The epistemological ramifications of quantum indeterminacy necessitate a fundamental reconceptualization of the deterministic paradigms that had hitherto characterized classical mechanics, insofar as the observer is no longer construed as an ontologically detached spectator but rather as a constitutive participant in the phenomenological actualization of measurable outcomes.`;

const keyStorageKey = (p: Provider) => `glr.key.${p}`;

export default function App() {
  const [text, setText] = useState(SAMPLE);
  const [provider, setProvider] = useState<Provider>("claude");
  const [scorer, setScorer] = useState<ScorerName>("multi_formula");
  const [low, setLow] = useState(5);
  const [high, setHigh] = useState(7);
  const [maxRounds, setMaxRounds] = useState(4);
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [scoreResult, setScoreResult] = useState<{
    grade: number;
    detail: Record<string, number>;
    method: string;
    pctDifficult: number;
  } | null>(null);
  const [result, setResult] = useState<LevelingResult | null>(null);
  const [liveRounds, setLiveRounds] = useState<Round[]>([]);

  useEffect(() => {
    setApiKey(localStorage.getItem(keyStorageKey(provider)) || "");
  }, [provider]);

  function saveKey(v: string) {
    setApiKey(v);
    if (v) localStorage.setItem(keyStorageKey(provider), v);
    else localStorage.removeItem(keyStorageKey(provider));
  }

  function clearKey() {
    localStorage.removeItem(keyStorageKey(provider));
    setApiKey("");
  }

  function onScore() {
    setErr(null);
    setResult(null);
    setLiveRounds([]);
    try {
      const score = getScorer(scorer)(text);
      const vocab = vocabScore(text);
      setScoreResult({
        grade: score.grade,
        detail: score.detail,
        method: score.method,
        pctDifficult: vocab.pctDifficultWords,
      });
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function onLevel() {
    if (!apiKey.trim()) {
      setErr(`Add your ${PROVIDER_KEY_LABEL[provider]} below to run the loop.`);
      return;
    }
    setBusy(true);
    setErr(null);
    setScoreResult(null);
    setResult(null);
    setLiveRounds([]);
    try {
      const res = await runLoop({
        text,
        target: { low, high },
        provider,
        apiKey: apiKey.trim(),
        model: model.trim() || undefined,
        maxRounds,
        scorer: getScorer(scorer),
        onRound: (r) => setLiveRounds((prev) => [...prev, r]),
      });
      setResult(res);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const placeholderModel = useMemo(() => DEFAULT_MODELS[provider], [provider]);

  return (
    <div className="app">
      <header>
        <h1>Grade-Level Rewriter</h1>
        <p className="sub">
          Score a reading passage, or rewrite it to a target grade band with a
          measure-and-iterate loop. Your API key stays in your browser.
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
            <span>Provider</span>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
            >
              <option value="claude">Claude (Anthropic)</option>
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini (Google)</option>
            </select>
          </label>
          <label>
            <span>Scorer</span>
            <select
              value={scorer}
              onChange={(e) => setScorer(e.target.value as ScorerName)}
            >
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
              placeholder={`default: ${placeholderModel}`}
              onChange={(e) => setModel(e.target.value)}
            />
          </label>
        </div>

        <div className="key-block">
          <label className="block">
            <span>
              {PROVIDER_KEY_LABEL[provider]} ·{" "}
              <a
                href={PROVIDER_KEY_LINK[provider]}
                target="_blank"
                rel="noreferrer"
              >
                get a key
              </a>
            </span>
            <div className="key-row">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => saveKey(e.target.value)}
                placeholder="paste here"
                autoComplete="off"
                spellCheck={false}
              />
              <button type="button" onClick={() => setShowKey((s) => !s)}>
                {showKey ? "hide" : "show"}
              </button>
              <button type="button" onClick={clearKey} disabled={!apiKey}>
                clear
              </button>
            </div>
          </label>
          <p className="hint">
            Stored only in this browser&rsquo;s <code>localStorage</code> under{" "}
            <code>{keyStorageKey(provider)}</code>. The key is sent directly
            from your browser to {providerName(provider)} — no server in
            between. Don&rsquo;t use this on a shared computer.
          </p>
        </div>

        <div className="actions">
          <button onClick={onScore} disabled={busy || !text.trim()}>
            Score only (no key needed)
          </button>
          <button
            className="primary"
            onClick={onLevel}
            disabled={busy || !text.trim()}
          >
            {busy ? `Working… (round ${liveRounds.length + 1})` : "Level to band"}
          </button>
        </div>
      </section>

      {err && <div className="error">Error: {err}</div>}

      {scoreResult && <ScoreView s={scoreResult} />}

      {(result || liveRounds.length > 0) && (
        <LevelView result={result} live={liveRounds} busy={busy} />
      )}

      <footer>
        <small>
          Runs entirely in your browser. Readability via{" "}
          <a
            href="https://www.npmjs.com/package/text-readability"
            target="_blank"
            rel="noreferrer"
          >
            text-readability
          </a>
          .
        </small>
      </footer>
    </div>
  );
}

function providerName(p: Provider): string {
  return p === "claude" ? "Anthropic" : p === "openai" ? "OpenAI" : "Google";
}

function ScoreView({
  s,
}: {
  s: { grade: number; detail: Record<string, number>; method: string; pctDifficult: number };
}) {
  return (
    <section className="panel">
      <h2>Score</h2>
      <p>
        <strong>Grade ({s.method}):</strong> {s.grade.toFixed(1)}
        {" · "}
        <strong>Difficult words:</strong> {s.pctDifficult.toFixed(0)}%
      </p>
      <details>
        <summary>Per-formula detail</summary>
        <pre>{JSON.stringify(s.detail, null, 2)}</pre>
      </details>
    </section>
  );
}

function LevelView({
  result,
  live,
  busy,
}: {
  result: LevelingResult | null;
  live: Round[];
  busy: boolean;
}) {
  const rounds = result?.rounds || live;
  return (
    <section className="panel">
      <h2>Leveling result</h2>
      {result ? (
        <p>
          <span className={result.passed ? "pill ok" : "pill fail"}>
            {result.passed ? "passed" : "did not converge"}
          </span>{" "}
          source <strong>{result.sourceGrade.toFixed(1)}</strong> → final{" "}
          <strong>{result.finalGrade.toFixed(1)}</strong> in {result.rounds.length}{" "}
          round{result.rounds.length === 1 ? "" : "s"} · fidelity{" "}
          {(result.fidelity.contentWordRetention * 100).toFixed(0)}%
        </p>
      ) : (
        <p className="sub">
          {busy ? "Streaming rounds as they come back…" : ""}
        </p>
      )}

      {result && (
        <>
          <h3>Final text</h3>
          <pre className="final">{result.finalText}</pre>
        </>
      )}

      <h3>Rounds</h3>
      <ol className="rounds">
        {rounds.map((rd) => (
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
