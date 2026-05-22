# Grade-Level Rewriter

A static web app that takes a reading passage and **proves** it has been rewritten to a target grade band — using a closed loop between an LLM rewriter and an objective `text-readability` referee. Runs entirely in the browser. Bring your own API key.

The core insight (from Skalbeck, 2023): one-shot LLM rewrites anchor on the **source** text and hit a target only in relative terms — the same instruction can produce grade 4.9, 10.0, 4.6, 6.9 from near-identical drafts. The fix is a feedback loop: the LLM rewrites, formulas measure, the measured grade is fed back as an **absolute** target, repeat until the text lands in band.

```
source → [Rewriter / LLM] → draft → [Referee / formulas] → in band?
            ^                                                 |
            |________ feedback: "you measured 8.2, too high" _|
```

## How it runs

- The browser holds your API key in `localStorage` (separate slot per provider).
- The browser POSTs the prompt directly to Anthropic / OpenAI / Google. No server in between.
- Scoring uses [`text-readability`](https://www.npmjs.com/package/text-readability) — same Flesch-Kincaid / SMOG / Gunning Fog / Coleman-Liau / ARI / Linsear Write formulas as the original Python `textstat`.
- `Score only` needs no key. `Level to band` uses your selected provider's key.

## Live site

Once the repo's Pages deploy lands, the app is at:

<https://rtusiime.github.io/grade-level-rewriter/>

## Local dev

```bash
cd frontend
npm install
npm run dev
```

Then open <http://localhost:5173>. For local dev the Vite `base` is overridden by the dev server, so you don't need to change anything.

## Repo layout

```
frontend/
  src/
    App.tsx             # UI: paste passage, pick provider/band, paste key, see rounds
    lib/
      readability.ts    # multi-formula + Flesch-Kincaid + vocab difficulty scorers
      target.ts         # grade-band acceptance + feedback strings
      rewriters.ts      # direct fetch() calls to Claude / OpenAI / Gemini
      loop.ts           # measure-and-iterate orchestration + fidelity proxy
  vite.config.ts        # base path is /grade-level-rewriter/ for Pages
.github/workflows/
  pages.yml             # builds frontend/dist and deploys to Pages on push to main
```

## API key handling — what to know

- The key is stored in `localStorage` under `glr.key.<provider>` and never sent anywhere except the provider's own API.
- Don't paste a shared / team key on a public computer. Use the **clear** button when you're done on a machine that isn't yours.
- Anthropic requires the header `anthropic-dangerous-direct-browser-access: true` for browser calls. Anthropic uses that to flag your account as knowingly making browser calls; the key is still visible to whoever has access to the device.
- Want one shared key without exposing it? Add a Cloudflare Worker / Vercel Function in front. Not in this repo.

## Caveats (still apply from the original tool)

- **Formulas are gameable.** Short sentences of short words can still be conceptually hard. The grade is necessary, not sufficient — keep a human eye on abstract concepts.
- **Use a band, not a knife edge.** 5.0–7.0 with tolerance, not "exactly 6.0" — small wording changes swing the formulas hard near the target.
- **Fidelity is the real risk.** Content-word retention is a crude proxy; synonyms aren't counted, so low retention can be fine *or* bad. For real validation, add an LLM fidelity judge.
- **Lexile ≠ FK.** If your school reports Lexile, FK grade is a proxy — map your Lexile band to an FK band.

## Credits

Original Python CLI tool and design (referee / rewriter / target / loop split) by the project author. This repo is the browser-side port.
