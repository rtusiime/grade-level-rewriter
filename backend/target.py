"""
Target = the acceptance criterion (what "5th/6th grade" actually means).

Swappable so you can A/B test definitions against real classroom outcomes:
maybe FK grade 5-6 works for your students, maybe a vocab cap matters more,
maybe you switch to a Lexile band later.
"""

from __future__ import annotations
from dataclasses import dataclass


@dataclass
class GradeBandTarget:
    """Accept when the referee's grade falls inside [low, high]."""
    low: float = 5.0
    high: float = 6.9
    # optional secondary gate: reject if too many 'difficult words' remain.
    # None = ignore. e.g. 0.20 means "no more than 20% difficult words".
    max_pct_difficult: float | None = None

    @property
    def description(self) -> str:
        return (f"a {self.low:.0f}th-{self.high:.0f}th grade student can read it "
                f"(target reading-grade level between {self.low} and {self.high})")

    def midpoint(self) -> float:
        return (self.low + self.high) / 2

    def check(self, grade: float, pct_difficult: float | None = None):
        """Return (passed: bool, feedback: str)."""
        if grade < self.low:
            fb = (f"Your rewrite measured grade {grade:.1f}, which is BELOW the "
                  f"target band {self.low}-{self.high}. It may be over-simplified "
                  f"or losing nuance -- you can use slightly richer sentences.")
            return False, fb
        if grade > self.high:
            fb = (f"Your rewrite measured grade {grade:.1f}, which is ABOVE the "
                  f"target band {self.low}-{self.high}. Shorten sentences further "
                  f"and replace harder words with simpler ones.")
            return False, fb
        if self.max_pct_difficult is not None and pct_difficult is not None:
            if pct_difficult > self.max_pct_difficult * 100:
                fb = (f"Grade {grade:.1f} is in band, but {pct_difficult:.0f}% of "
                      f"words are 'difficult' (cap is {self.max_pct_difficult*100:.0f}%). "
                      f"Swap remaining hard/abstract words for concrete everyday ones.")
                return False, fb
        return True, f"On target: grade {grade:.1f} within {self.low}-{self.high}."
