"""Smoke tests: verify imports, client construction, and model deserialization."""

from uuid import UUID
import datetime

from ash_sdk import Client, AuthenticatedClient
from ash_sdk.models import (
    Agent,
    ApiError,
    Session,
    SessionStatus,
    QueueItem,
    QueueItemStatus,
    Message,
    MessageRole,
    HealthResponse,
    PoolStats,
    Credential,
    Attachment,
    SessionEvent,
    SessionEventType,
    UsageEvent,
    UsageStats,
)
from ash_sdk.types import UNSET


def test_client_construction():
    client = Client(base_url="http://localhost:4100")
    httpx_client = client.get_httpx_client()
    assert str(httpx_client.base_url) == "http://localhost:4100"


def test_authenticated_client_construction():
    client = AuthenticatedClient(base_url="http://localhost:4100", token="test-key")
    assert client.token == "test-key"
    assert client.prefix == "Bearer"


def test_client_context_manager():
    with Client(base_url="http://localhost:4100") as client:
        assert client.get_httpx_client() is not None


def test_client_with_headers():
    client = Client(base_url="http://localhost:4100")
    client2 = client.with_headers({"X-Custom": "value"})
    assert isinstance(client2, Client)


def test_agent_from_dict():
    agent = Agent.from_dict({
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "name": "test",
        "version": 1,
        "path": "/tmp/test",
        "createdAt": "2025-01-01T00:00:00Z",
        "updatedAt": "2025-01-01T00:00:00Z",
    })
    assert agent.name == "test"
    assert agent.version == 1
    assert agent.path == "/tmp/test"
    assert isinstance(agent.id, UUID)
    assert isinstance(agent.created_at, datetime.datetime)


def test_agent_to_dict():
    agent = Agent.from_dict({
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "name": "test",
        "version": 1,
        "path": "/tmp/test",
        "createdAt": "2025-01-01T00:00:00Z",
        "updatedAt": "2025-01-01T00:00:00Z",
    })
    d = agent.to_dict()
    assert d["name"] == "test"
    assert d["version"] == 1
    assert d["id"] == "550e8400-e29b-41d4-a716-446655440000"


def test_session_from_dict():
    session = Session.from_dict({
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "agentName": "test",
        "sandboxId": "sb-1",
        "status": "active",
        "createdAt": "2025-01-01T00:00:00Z",
        "lastActiveAt": "2025-01-01T00:00:00Z",
    })
    assert isinstance(session.id, UUID)
    assert session.agent_name == "test"
    assert session.status == "active"
    assert session.sandbox_id == "sb-1"
    assert isinstance(session.created_at, datetime.datetime)


def test_session_optional_fields():
    session = Session.from_dict({
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "agentName": "test",
        "sandboxId": "sb-1",
        "status": "active",
        "createdAt": "2025-01-01T00:00:00Z",
        "lastActiveAt": "2025-01-01T00:00:00Z",
        "runnerId": "runner-1",
    })
    assert session.runner_id == "runner-1"


def test_session_status_values():
    for status in ("starting", "active", "paused", "stopped", "ended", "error"):
        session = Session.from_dict({
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "agentName": "test",
            "sandboxId": "sb-1",
            "status": status,
            "createdAt": "2025-01-01T00:00:00Z",
            "lastActiveAt": "2025-01-01T00:00:00Z",
        })
        assert session.status == status


def test_api_error_from_dict():
    err = ApiError.from_dict({"error": "not found", "statusCode": 404})
    assert err.error == "not found"
    assert err.status_code == 404


def test_api_error_to_dict():
    err = ApiError(error="bad request", status_code=400)
    d = err.to_dict()
    assert d == {"error": "bad request", "statusCode": 400}


def test_message_from_dict():
    msg = Message.from_dict({
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "sessionId": "660e8400-e29b-41d4-a716-446655440000",
        "role": "user",
        "content": '{"text": "hello"}',
        "sequence": 1,
        "createdAt": "2025-01-01T00:00:00Z",
    })
    assert msg.role == "user"
    assert msg.content == '{"text": "hello"}'
    assert msg.sequence == 1
    assert isinstance(msg.id, UUID)


def test_queue_item_from_dict():
    item = QueueItem.from_dict({
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "agentName": "test-bot",
        "prompt": "Hello",
        "status": "pending",
        "priority": 5,
        "retryCount": 0,
        "maxRetries": 3,
        "createdAt": "2025-01-01T00:00:00Z",
    })
    assert isinstance(item.id, UUID)
    assert item.agent_name == "test-bot"
    assert item.prompt == "Hello"
    assert item.status == "pending"
    assert item.priority == 5


def test_health_response_from_dict():
    health = HealthResponse.from_dict({
        "status": "ok",
        "activeSessions": 3,
        "activeSandboxes": 2,
        "uptime": 1000,
        "pool": {
            "total": 5,
            "cold": 1,
            "warming": 0,
            "warm": 2,
            "waiting": 0,
            "running": 2,
            "maxCapacity": 10,
            "resumeWarmHits": 0,
            "resumeColdHits": 0,
            "preWarmHits": 0,
        },
    })
    assert health.status == "ok"
    assert health.active_sessions == 3
    assert health.pool.total == 5
    assert health.pool.max_capacity == 10


def test_credential_from_dict():
    cred = Credential.from_dict({
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "type": "anthropic",
        "label": "My API Key",
        "createdAt": "2025-01-01T00:00:00Z",
    })
    assert isinstance(cred.id, UUID)
    assert cred.type_ == "anthropic"
    assert cred.label == "My API Key"


def test_session_event_from_dict():
    evt = SessionEvent.from_dict({
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "sessionId": "660e8400-e29b-41d4-a716-446655440000",
        "type": "text",
        "data": '{"content": "Hello"}',
        "sequence": 1,
        "createdAt": "2025-01-01T00:00:00Z",
    })
    assert evt.type_ == "text"
    assert evt.sequence == 1
    assert isinstance(evt.id, UUID)


def test_usage_stats_from_dict():
    stats = UsageStats.from_dict({
        "totalInputTokens": 100,
        "totalOutputTokens": 200,
        "totalCacheCreationTokens": 50,
        "totalCacheReadTokens": 25,
        "totalToolCalls": 3,
        "totalMessages": 5,
        "totalComputeSeconds": 10.5,
    })
    assert stats.total_input_tokens == 100
    assert stats.total_output_tokens == 200
    assert stats.total_cache_creation_tokens == 50
    assert stats.total_tool_calls == 3


def test_model_additional_properties():
    """Models should preserve unknown fields via additional_properties."""
    agent = Agent.from_dict({
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "name": "test",
        "version": 1,
        "path": "/tmp/test",
        "createdAt": "2025-01-01T00:00:00Z",
        "updatedAt": "2025-01-01T00:00:00Z",
        "customField": "custom_value",
    })
    assert agent["customField"] == "custom_value"
    assert "customField" in agent


# -- AshClient high-level client ---------------------------------------------------


def test_ash_client_import():
    """AshClient should be importable from ash_sdk top-level."""
    from ash_sdk import AshClient
    assert AshClient is not None


def test_ash_client_construction():
    from ash_sdk import AshClient
    client = AshClient("http://localhost:4100", token="test-key")
    assert client.base_url == "http://localhost:4100"
    assert client.token == "test-key"
    assert client.timeout == 300.0


def test_ash_client_construction_trailing_slash():
    from ash_sdk import AshClient
    client = AshClient("http://localhost:4100/", token="test-key")
    assert client.base_url == "http://localhost:4100"


def test_ash_client_headers():
    from ash_sdk import AshClient
    client = AshClient("http://localhost:4100", token="my-key")
    headers = client._headers()
    assert headers["Authorization"] == "Bearer my-key"
    assert headers["Content-Type"] == "application/json"
    assert "Accept" not in headers

    streaming_headers = client._headers(streaming=True)
    assert streaming_headers["Accept"] == "text/event-stream"

    no_ct_headers = client._headers(content_type=None)
    assert "Content-Type" not in no_ct_headers
    assert no_ct_headers["Authorization"] == "Bearer my-key"


def test_ash_client_headers_no_token():
    from ash_sdk import AshClient
    client = AshClient("http://localhost:4100")
    headers = client._headers()
    assert "Authorization" not in headers
