"""SSE stream parser for Ash API responses.

Mirrors the TypeScript parseSSEStream() logic from @ash-ai/sdk.
Parses `event: <type>` and `data: <json>` lines from a text/event-stream response.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Generator, AsyncGenerator, Iterator, Union

import httpx


@dataclass
class MessageEvent:
    """An SDK message event from the SSE stream."""

    type: str = "message"
    data: dict[str, Any] = field(default_factory=dict)


@dataclass
class ErrorEvent:
    """An error event from the SSE stream."""

    type: str = "error"
    data: dict[str, Any] = field(default_factory=dict)

    @property
    def error(self) -> str:
        return self.data.get("error", "Unknown error")


@dataclass
class DoneEvent:
    """A done event indicating the turn is complete."""

    type: str = "done"
    data: dict[str, Any] = field(default_factory=dict)

    @property
    def session_id(self) -> str:
        return self.data.get("sessionId", "")


StreamEvent = Union[MessageEvent, ErrorEvent, DoneEvent]

_EVENT_CLASSES: dict[str, type] = {
    "message": MessageEvent,
    "error": ErrorEvent,
    "done": DoneEvent,
}


def _make_event(event_type: str, data: dict[str, Any]) -> StreamEvent:
    cls = _EVENT_CLASSES.get(event_type, MessageEvent)
    return cls(type=event_type, data=data)


def parse_sse_lines(lines: Iterator[str]) -> Generator[StreamEvent, None, None]:
    """Parse SSE lines into typed StreamEvent objects.

    Expects lines from a text/event-stream response (already split by newline).
    """
    current_event = ""
    for line in lines:
        if line.startswith("event: "):
            current_event = line[7:].strip()
        elif line.startswith("data: "):
            raw = line[6:]
            try:
                data = json.loads(raw)
                yield _make_event(current_event, data)
            except json.JSONDecodeError:
                pass


def parse_sse_stream(response: httpx.Response) -> Generator[StreamEvent, None, None]:
    """Parse a streaming httpx Response (sync) into typed StreamEvent objects."""
    current_event = ""
    for line in response.iter_lines():
        if line.startswith("event: "):
            current_event = line[7:].strip()
        elif line.startswith("data: "):
            raw = line[6:]
            try:
                data = json.loads(raw)
                yield _make_event(current_event, data)
            except json.JSONDecodeError:
                pass


async def parse_sse_stream_async(response: httpx.Response) -> AsyncGenerator[StreamEvent, None]:
    """Parse a streaming httpx Response (async) into typed StreamEvent objects."""
    current_event = ""
    async for line in response.aiter_lines():
        if line.startswith("event: "):
            current_event = line[7:].strip()
        elif line.startswith("data: "):
            raw = line[6:]
            try:
                data = json.loads(raw)
                yield _make_event(current_event, data)
            except json.JSONDecodeError:
                pass
