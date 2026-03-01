"""Tests for generated API function structure, response parsing, and SSE streaming."""

from http import HTTPStatus

from ash_sdk.api.agents import post_api_agents, get_api_agents, get_api_agents_name, delete_api_agents_name
from ash_sdk.api.sessions import (
    post_api_sessions,
    get_api_sessions,
    get_api_sessions_id,
    delete_api_sessions_id,
    post_api_sessions_id_pause,
    post_api_sessions_id_resume,
)
from ash_sdk.api.health import get_health
from ash_sdk.api.queue import post_api_queue, get_api_queue, get_api_queue_id
from ash_sdk.api.credentials import post_api_credentials, get_api_credentials
from ash_sdk.api.usage import get_api_usage, get_api_usage_stats
from ash_sdk.models import (
    PostApiAgentsBody,
    PostApiAgentsResponse201,
    PostApiSessionsBody,
    PostApiSessionsResponse201,
    PostApiSessionsIdMessagesBody,
    Agent,
    Session,
    ApiError,
    HealthResponse,
)
from ash_sdk.streaming import (
    StreamEvent,
    MessageEvent,
    TextDeltaEvent,
    ThinkingDeltaEvent,
    ToolUseEvent,
    ToolResultEvent,
    TurnCompleteEvent,
    SessionStartEvent,
    ErrorEvent,
    DoneEvent,
    _parse_event,
    parse_sse_stream,
)


def test_api_modules_have_sync_and_async():
    """Each API module should expose sync, sync_detailed, asyncio, and asyncio_detailed."""
    for mod in [post_api_agents, get_api_agents, get_health, post_api_sessions]:
        assert hasattr(mod, "sync"), f"{mod.__name__} missing sync"
        assert hasattr(mod, "sync_detailed"), f"{mod.__name__} missing sync_detailed"
        assert hasattr(mod, "asyncio"), f"{mod.__name__} missing asyncio"
        assert hasattr(mod, "asyncio_detailed"), f"{mod.__name__} missing asyncio_detailed"


def test_post_api_agents_body_construction():
    body = PostApiAgentsBody(name="test-agent", path="/tmp/agent")
    assert body.name == "test-agent"
    assert body.path == "/tmp/agent"

    d = body.to_dict()
    assert d == {"name": "test-agent", "path": "/tmp/agent"}


def test_post_api_sessions_body_construction():
    body = PostApiSessionsBody(agent="my-bot")
    assert body.agent == "my-bot"

    d = body.to_dict()
    assert d == {"agent": "my-bot"}


def test_post_api_sessions_body_with_new_fields():
    """Session creation body should include all SDK parity fields."""
    body = PostApiSessionsBody(
        agent="my-bot",
        model="claude-sonnet-4-20250514",
        system_prompt="You are helpful.",
        permission_mode="bypassPermissions",
        allowed_tools=["Read", "Write"],
        disallowed_tools=["Bash"],
        betas=["interleaved-thinking"],
        initial_agent="main",
    )
    d = body.to_dict()
    assert d["agent"] == "my-bot"
    assert d["model"] == "claude-sonnet-4-20250514"
    assert d["systemPrompt"] == "You are helpful."
    assert d["permissionMode"] == "bypassPermissions"
    assert d["allowedTools"] == ["Read", "Write"]
    assert d["disallowedTools"] == ["Bash"]
    assert d["betas"] == ["interleaved-thinking"]
    assert d["initialAgent"] == "main"


def test_post_api_sessions_body_roundtrip():
    """New fields should survive from_dict -> to_dict roundtrip."""
    original = {
        "agent": "my-bot",
        "model": "claude-sonnet-4-20250514",
        "systemPrompt": "Be concise.",
        "allowedTools": ["Read"],
    }
    body = PostApiSessionsBody.from_dict(original)
    assert body.model == "claude-sonnet-4-20250514"
    assert body.system_prompt == "Be concise."
    assert body.allowed_tools == ["Read"]

    d = body.to_dict()
    assert d["model"] == "claude-sonnet-4-20250514"
    assert d["systemPrompt"] == "Be concise."
    assert d["allowedTools"] == ["Read"]


def test_post_api_messages_body_with_new_fields():
    """Message body should include all query options."""
    body = PostApiSessionsIdMessagesBody(
        content="Hello",
        model="claude-sonnet-4-20250514",
        max_turns=5,
        max_budget_usd=1.0,
        effort="high",
    )
    d = body.to_dict()
    assert d["content"] == "Hello"
    assert d["model"] == "claude-sonnet-4-20250514"
    assert d["maxTurns"] == 5
    assert d["maxBudgetUsd"] == 1.0
    assert d["effort"] == "high"


def test_post_api_agents_response_201_from_dict():
    resp = PostApiAgentsResponse201.from_dict({
        "agent": {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "name": "test",
            "version": 1,
            "path": "/tmp/test",
            "createdAt": "2025-01-01T00:00:00Z",
            "updatedAt": "2025-01-01T00:00:00Z",
        }
    })
    assert resp.agent.name == "test"
    assert resp.agent.version == 1


def test_post_api_sessions_response_201_from_dict():
    resp = PostApiSessionsResponse201.from_dict({
        "session": {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "agentName": "test",
            "sandboxId": "sb-1",
            "status": "active",
            "createdAt": "2025-01-01T00:00:00Z",
            "lastActiveAt": "2025-01-01T00:00:00Z",
        }
    })
    assert resp.session.agent_name == "test"
    assert resp.session.status == "active"


def test_all_endpoint_tags_present():
    """Verify we have API modules for all major endpoint groups."""
    from ash_sdk.api import agents, sessions, health, queue, credentials, usage, attachments
    assert agents is not None
    assert sessions is not None
    assert health is not None
    assert queue is not None
    assert credentials is not None
    assert usage is not None
    assert attachments is not None


# -- SSE streaming event parsing ---------------------------------------------------


def test_parse_event_message():
    event = _parse_event("message", {"type": "assistant", "message": {"content": "hi"}})
    assert isinstance(event, MessageEvent)
    assert event.data["type"] == "assistant"


def test_parse_event_text_delta():
    event = _parse_event("text_delta", {"delta": "Hello "})
    assert isinstance(event, TextDeltaEvent)
    assert event.delta == "Hello "


def test_parse_event_thinking_delta():
    event = _parse_event("thinking_delta", {"delta": "I think..."})
    assert isinstance(event, ThinkingDeltaEvent)
    assert event.delta == "I think..."


def test_parse_event_tool_use():
    event = _parse_event("tool_use", {"id": "t1", "name": "Read", "input": {"path": "/tmp"}})
    assert isinstance(event, ToolUseEvent)
    assert event.id == "t1"
    assert event.name == "Read"
    assert event.input == {"path": "/tmp"}


def test_parse_event_tool_result():
    event = _parse_event("tool_result", {"tool_use_id": "t1", "content": "file contents", "is_error": False})
    assert isinstance(event, ToolResultEvent)
    assert event.tool_use_id == "t1"
    assert event.content == "file contents"
    assert event.is_error is False


def test_parse_event_tool_result_error():
    event = _parse_event("tool_result", {"tool_use_id": "t1", "content": "not found", "is_error": True})
    assert isinstance(event, ToolResultEvent)
    assert event.is_error is True


def test_parse_event_turn_complete():
    event = _parse_event("turn_complete", {"numTurns": 3, "result": "done"})
    assert isinstance(event, TurnCompleteEvent)
    assert event.num_turns == 3
    assert event.result == "done"


def test_parse_event_session_start():
    event = _parse_event("session_start", {"sessionId": "abc-123", "version": "0.0.16"})
    assert isinstance(event, SessionStartEvent)
    assert event.session_id == "abc-123"
    assert event.version == "0.0.16"


def test_parse_event_error():
    event = _parse_event("error", {"error": "Session not found"})
    assert isinstance(event, ErrorEvent)
    assert event.error == "Session not found"


def test_parse_event_done():
    event = _parse_event("done", {"sessionId": "abc-123"})
    assert isinstance(event, DoneEvent)
    assert event.session_id == "abc-123"


def test_parse_event_unknown():
    event = _parse_event("custom_event", {"foo": "bar"})
    assert isinstance(event, StreamEvent)
    assert event.event == "custom_event"
    assert event.data == {"foo": "bar"}


def test_parse_sse_stream_sync():
    """Test sync SSE stream parsing with a mock httpx Response."""
    sse_lines = (
        "event: session_start\n"
        'data: {"sessionId": "s1", "version": "0.0.16"}\n'
        "\n"
        "event: message\n"
        'data: {"type": "assistant", "message": {"content": "Hello!"}}\n'
        "\n"
        "event: text_delta\n"
        'data: {"delta": "Hello"}\n'
        "\n"
        "event: done\n"
        'data: {"sessionId": "s1"}\n'
        "\n"
    )

    class MockResponse:
        def iter_lines(self):
            for line in sse_lines.split("\n"):
                yield line

    events = list(parse_sse_stream(MockResponse()))  # type: ignore[arg-type]
    assert len(events) == 4
    assert isinstance(events[0], SessionStartEvent)
    assert events[0].session_id == "s1"
    assert isinstance(events[1], MessageEvent)
    assert events[1].data["type"] == "assistant"
    assert isinstance(events[2], TextDeltaEvent)
    assert events[2].delta == "Hello"
    assert isinstance(events[3], DoneEvent)
    assert events[3].session_id == "s1"


def test_parse_sse_stream_skips_invalid_json():
    """Non-JSON data lines should be silently skipped."""
    sse_lines = (
        "event: message\n"
        "data: not-json\n"
        "\n"
        "event: done\n"
        'data: {"sessionId": "s1"}\n'
        "\n"
    )

    class MockResponse:
        def iter_lines(self):
            for line in sse_lines.split("\n"):
                yield line

    events = list(parse_sse_stream(MockResponse()))  # type: ignore[arg-type]
    assert len(events) == 1
    assert isinstance(events[0], DoneEvent)
