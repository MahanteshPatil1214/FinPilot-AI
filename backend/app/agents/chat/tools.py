"""Bounded execution of allowlisted tools for one assistant turn.

The LLM never chooses tools: handlers call a fixed, small set of read-only
service functions directly. The runner enforces a maximum number of executions
and a wall-clock budget, and records an honest status for every call (including
skipped ones). Results are validated by the caller, never by the model.
"""

import logging
import time
from decimal import Decimal, InvalidOperation
from typing import Callable, List, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

# Tool call statuses (mirrored by app/schemas/chat.py::ChatToolCall.status).
STATUS_OK = "ok"
STATUS_EMPTY = "empty"
STATUS_ERROR = "error"
STATUS_SKIPPED = "skipped"


class TurnBudget:
    """A shared wall-clock budget for a single turn."""

    def __init__(self, seconds: Optional[float] = None):
        self.seconds = (
            settings.CHAT_TURN_TIMEOUT_SECONDS if seconds is None else seconds
        )
        self._start = time.monotonic()

    def remaining(self) -> float:
        return self.seconds - (time.monotonic() - self._start)

    def expired(self) -> bool:
        return self.remaining() <= 0


class ToolRunner:
    """Records and bounds the read-only tools executed in one turn."""

    def __init__(
        self,
        max_calls: Optional[int] = None,
        budget: Optional[TurnBudget] = None,
    ):
        self.max_calls = (
            settings.CHAT_MAX_TOOL_CALLS if max_calls is None else max_calls
        )
        self.budget = budget or TurnBudget()
        self.calls: List[dict] = []
        self._used = 0

    def _record(
        self, name: str, label: str, status: str, summary: str, duration_ms: int
    ) -> None:
        self.calls.append(
            {
                "name": name,
                "label": label,
                "status": status,
                "summary": summary,
                "duration_ms": duration_ms,
            }
        )

    def record(
        self, name: str, label: str, status: str, summary: str, duration_ms: int = 0
    ) -> None:
        """Record a step that a handler executed itself (e.g. an LLM answer)."""
        self._record(name, label, status, summary, duration_ms)

    def run(
        self,
        name: str,
        label: str,
        fn: Callable,
        *args,
        summary: Optional[str] = None,
        **kwargs,
    ):
        """Execute ``fn`` if budget allows; otherwise record a skipped call.

        Returns the function result, or ``None`` when the call was skipped or
        raised. A raising tool becomes an ``error`` status and never propagates,
        so one failed step cannot abort the whole turn.
        """
        if self._used >= self.max_calls:
            self._record(
                name, label, STATUS_SKIPPED, "Step limit reached for this turn", 0
            )
            return None
        if self.budget.expired():
            self._record(
                name, label, STATUS_SKIPPED, "Time budget exhausted", 0
            )
            return None

        self._used += 1
        start = time.monotonic()
        try:
            result = fn(*args, **kwargs)
        except Exception as exc:  # noqa: BLE001 - recorded, not swallowed
            duration = int((time.monotonic() - start) * 1000)
            # Log the type only; instance messages may embed financial data.
            logger.warning("Tool %s failed (error: %s)", name, type(exc).__name__)
            self._record(
                name,
                label,
                STATUS_ERROR,
                summary or f"{label} could not complete",
                duration,
            )
            return None

        duration = int((time.monotonic() - start) * 1000)
        empty = result is None or (
            hasattr(result, "__len__") and len(result) == 0
        )
        status = STATUS_EMPTY if empty else STATUS_OK
        self._record(
            name,
            label,
            status,
            summary or ("No matching records" if empty else f"{label} completed"),
            duration,
        )
        return result


def as_decimal(value) -> Optional[Decimal]:
    """Coerce a stored monetary value to ``Decimal`` without float rounding."""
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None
