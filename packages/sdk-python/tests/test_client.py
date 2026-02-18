"""Smoke tests: verify imports and basic model construction."""

from ash_sdk import AshClient, Agent, Session, ApiError
from ash_sdk.streaming import MessageEvent, ErrorEvent, DoneEvent


def test_client_import():
    client = AshClient("http://localhost:4100")
    assert client.server_url == "http://localhost:4100"


def test_client_strips_trailing_slash():
    client = AshClient("http://localhost:4100/")
    assert client.server_url == "http://localhost:4100"


def test_agent_from_dict():
    agent = Agent.from_dict({
        "name": "test",
        "version": 1,
        "path": "/tmp/test",
        "createdAt": "2025-01-01T00:00:00Z",
        "updatedAt": "2025-01-01T00:00:00Z",
    })
    assert agent.name == "test"
    assert agent.version == 1


def test_session_from_dict():
    session = Session.from_dict({
        "id": "abc-123",
        "agentName": "test",
        "sandboxId": "sb-1",
        "status": "active",
        "createdAt": "2025-01-01T00:00:00Z",
        "lastActiveAt": "2025-01-01T00:00:00Z",
    })
    assert session.id == "abc-123"
    assert session.agent_name == "test"
    assert session.status == "active"


def test_api_error():
    err = ApiError.from_dict({"error": "not found", "statusCode": 404})
    assert err.error == "not found"
    assert err.status_code == 404
    assert "not found" in str(err)


def test_stream_event_types():
    msg = MessageEvent(data={"type": "assistant"})
    assert msg.type == "message"

    err = ErrorEvent(data={"error": "fail"})
    assert err.error == "fail"

    done = DoneEvent(data={"sessionId": "s1"})
    assert done.session_id == "s1"
