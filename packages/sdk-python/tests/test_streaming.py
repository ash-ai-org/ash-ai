"""Tests for generated API function structure and response parsing."""

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
    Agent,
    Session,
    ApiError,
    HealthResponse,
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
