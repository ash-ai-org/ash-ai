"""SSE streaming support for the Ash Python SDK.

This module is hand-written (not auto-generated) and is preserved across SDK
regeneration by generate.sh.

Provides sync and async iterators over Server-Sent Events from the
POST /api/sessions/{id}/messages endpoint.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, AsyncGenerator, Generator, Iterator

import httpx


@dataclass
class StreamEvent:
    """A parsed SSE event from the Ash server.

    Attributes:
        event: The SSE event type (e.g. 'message', 'text_delta', 'error', 'done').
        data: The parsed JSON payload.
    """

    event: str
    data: dict[str, Any]


@dataclass
class MessageEvent:
    """An SDK Message event (event: message).

    Contains the raw SDK message as a dict. The message format follows the
    Claude Code SDK Message type (AssistantMessage, UserMessage, ResultMessage, etc.).
    """

    data: dict[str, Any]


@dataclass
class TextDeltaEvent:
    """Incremental text chunk (event: text_delta)."""

    delta: str


@dataclass
class ThinkingDeltaEvent:
    """Incremental thinking content (event: thinking_delta)."""

    delta: str


@dataclass
class ToolUseEvent:
    """Tool invocation (event: tool_use)."""

    id: str
    name: str
    input: Any


@dataclass
class ToolResultEvent:
    """Tool execution result (event: tool_result)."""

    tool_use_id: str
    content: Any
    is_error: bool = False


@dataclass
class TurnCompleteEvent:
    """Agent turn completed (event: turn_complete)."""

    num_turns: int | None = None
    result: str | None = None


@dataclass
class SessionStartEvent:
    """Session start marker (event: session_start)."""

    session_id: str
    version: str | None = None


@dataclass
class ErrorEvent:
    """Error from the server (event: error)."""

    error: str


@dataclass
class DoneEvent:
    """Stream termination (event: done)."""

    session_id: str


# Union of all typed event classes
AshEvent = (
    MessageEvent
    | TextDeltaEvent
    | ThinkingDeltaEvent
    | ToolUseEvent
    | ToolResultEvent
    | TurnCompleteEvent
    | SessionStartEvent
    | ErrorEvent
    | DoneEvent
    | StreamEvent  # fallback for unknown event types
)


def _parse_event(event_type: str, data: dict[str, Any]) -> AshEvent:
    """Convert a raw SSE event into a typed dataclass."""
    if event_type == "message":
        return MessageEvent(data=data)
    elif event_type == "text_delta":
        return TextDeltaEvent(delta=data.get("delta", ""))
    elif event_type == "thinking_delta":
        return ThinkingDeltaEvent(delta=data.get("delta", ""))
    elif event_type == "tool_use":
        return ToolUseEvent(id=data.get("id", ""), name=data.get("name", ""), input=data.get("input"))
    elif event_type == "tool_result":
        return ToolResultEvent(
            tool_use_id=data.get("tool_use_id", ""),
            content=data.get("content"),
            is_error=data.get("is_error", False),
        )
    elif event_type == "turn_complete":
        return TurnCompleteEvent(num_turns=data.get("numTurns"), result=data.get("result"))
    elif event_type == "session_start":
        return SessionStartEvent(session_id=data.get("sessionId", ""), version=data.get("version"))
    elif event_type == "error":
        return ErrorEvent(error=data.get("error", "Unknown error"))
    elif event_type == "done":
        return DoneEvent(session_id=data.get("sessionId", ""))
    else:
        return StreamEvent(event=event_type, data=data)


def parse_sse_stream(response: httpx.Response) -> Generator[AshEvent, None, None]:
    """Parse an SSE stream from an httpx Response (sync).

    Iterates over the response bytes line-by-line, parsing SSE frames into
    typed event objects.

    Args:
        response: An httpx.Response from a streaming request.

    Yields:
        Typed event objects (MessageEvent, TextDeltaEvent, ErrorEvent, etc.).
    """
    current_event = ""
    for line in response.iter_lines():
        if line.startswith("event: "):
            current_event = line[7:].strip()
        elif line.startswith("data: "):
            raw = line[6:]
            try:
                data = json.loads(raw)
                yield _parse_event(current_event, data)
            except json.JSONDecodeError:
                pass  # Skip non-JSON data lines


async def parse_sse_stream_async(response: httpx.Response) -> AsyncGenerator[AshEvent, None]:
    """Parse an SSE stream from an httpx Response (async).

    Iterates over the response bytes line-by-line, parsing SSE frames into
    typed event objects.

    Args:
        response: An httpx.Response from a streaming request.

    Yields:
        Typed event objects (MessageEvent, TextDeltaEvent, ErrorEvent, etc.).
    """
    current_event = ""
    async for line in response.aiter_lines():
        if line.startswith("event: "):
            current_event = line[7:].strip()
        elif line.startswith("data: "):
            raw = line[6:]
            try:
                data = json.loads(raw)
                yield _parse_event(current_event, data)
            except json.JSONDecodeError:
                pass  # Skip non-JSON data lines
