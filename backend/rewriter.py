"""
Rewriter = the LLM layer that actually simplifies text.

Every Rewriter implements the same interface:

    rewrite(text, target, feedback=None) -> str

so they are fully SWAPPABLE. This is the main A/B-testing axis: run the same
passage + same target through ClaudeRewriter vs OpenAIRewriter vs
GeminiRewriter and see which lands on target with the fewest revision rounds
and the least meaning loss.

KEY DESIGN POINT (this is the whole reason the loop exists):
Skalbeck's 2023 finding -- when you just tell an LLM "rewrite at 6th grade",
it anchors on the SOURCE text and hits the target only in RELATIVE terms.
So we do NOT trust a one-shot rewrite. The loop measures the output with the
objective referee and feeds the *measured grade* back as `feedback`, which
turns a relative nudge into an absolute target.

API keys are read from environment variables so they never get hard-coded:
    ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY
"""

from __future__ import annotations
import os
from dataclasses import dataclass


def build_prompt(text: str, target_desc: str, feedback: str | None) -> str:
    """The prompt template is itself a swappable A/B variable -- edit freely."""
    base = (
        "You are an expert at adapting reading passages for younger students "
        "while preserving the key information and meaning.\n\n"
        f"TARGET: Rewrite the passage so that {target_desc}.\n"
        "Rules:\n"
        "- Keep every important fact and idea from the original.\n"
        "- Use shorter sentences and common, concrete words.\n"
        "- Do NOT add new information or opinions.\n"
        "- Return ONLY the rewritten passage, no preamble.\n"
    )
    if feedback:
        base += (
            "\nIMPORTANT FEEDBACK on your previous attempt:\n"
            f"{feedback}\n"
            "Revise accordingly. Measured grade levels are ABSOLUTE targets, "
            "not relative to the source.\n"
        )
    base += f"\nPASSAGE:\n{text}\n"
    return base


class ManualRewriter:
    """Used for the no-API-key DEMO. The 'LLM' is a human (or Claude in chat)
    who supplies the rewrite out-of-band. The loop calls .rewrite(), which
    pulls the next queued response. Lets us exercise the full loop with zero
    cost while the API rewriters stay drop-in compatible."""
    name = "manual"

    def __init__(self, responses: list[str] | None = None):
        self._queue = list(responses or [])

    def feed(self, text: str):
        self._queue.append(text)

    def rewrite(self, text: str, target_desc: str, feedback: str | None = None) -> str:
        if not self._queue:
            raise RuntimeError(
                "ManualRewriter queue empty. In the live demo, Claude supplies "
                "each rewrite based on the prompt + feedback the loop prints."
            )
        return self._queue.pop(0)


class ClaudeRewriter:
    name = "claude"

    def __init__(self, model: str = "claude-opus-4-6", max_tokens: int = 2000,
                 temperature: float = 0.3):
        self.model, self.max_tokens, self.temperature = model, max_tokens, temperature

    def rewrite(self, text: str, target_desc: str, feedback: str | None = None) -> str:
        import anthropic  # pip install anthropic
        client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        msg = client.messages.create(
            model=self.model, max_tokens=self.max_tokens, temperature=self.temperature,
            messages=[{"role": "user",
                       "content": build_prompt(text, target_desc, feedback)}],
        )
        return "".join(b.text for b in msg.content if b.type == "text").strip()


class OpenAIRewriter:
    name = "openai"

    def __init__(self, model: str = "gpt-4o", temperature: float = 0.3):
        self.model, self.temperature = model, temperature

    def rewrite(self, text: str, target_desc: str, feedback: str | None = None) -> str:
        from openai import OpenAI  # pip install openai
        client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
        resp = client.chat.completions.create(
            model=self.model, temperature=self.temperature,
            messages=[{"role": "user",
                       "content": build_prompt(text, target_desc, feedback)}],
        )
        return resp.choices[0].message.content.strip()


class GeminiRewriter:
    name = "gemini"

    def __init__(self, model: str = "gemini-2.0-flash", temperature: float = 0.3):
        self.model, self.temperature = model, temperature

    def rewrite(self, text: str, target_desc: str, feedback: str | None = None) -> str:
        import google.generativeai as genai  # pip install google-generativeai
        genai.configure(api_key=os.environ["GEMINI_API_KEY"])
        model = genai.GenerativeModel(self.model)
        resp = model.generate_content(
            build_prompt(text, target_desc, feedback),
            generation_config={"temperature": self.temperature},
        )
        return resp.text.strip()


REWRITERS = {
    "manual": ManualRewriter,
    "claude": ClaudeRewriter,
    "openai": OpenAIRewriter,
    "gemini": GeminiRewriter,
}


def get_rewriter(name: str, **kwargs):
    if name not in REWRITERS:
        raise KeyError(f"Unknown rewriter '{name}'. Options: {list(REWRITERS)}")
    return REWRITERS[name](**kwargs)
