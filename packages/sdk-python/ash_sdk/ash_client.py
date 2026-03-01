"""High-level Ash client with SSE streaming support.

This module is hand-written (not auto-generated) and is preserved across SDK
regeneration by generate.sh.

Provides ``AshClient`` — a batteries-included wrapper around the generated
low-level API functions that adds:
  - SSE streaming for ``send_message_stream`` / ``asend_message_stream``
  - Convenience methods that return typed models directly
"""

from __future__ import annotations

from typing import Any, Generator, AsyncGenerator
from uuid import UUID

import httpx

from .models.agent import Agent
from .models.session import Session
from .models.health_response import HealthResponse
from .models.post_api_sessions_body import PostApiSessionsBody
from .models.post_api_sessions_body_extra_env import PostApiSessionsBodyExtraEnv
from .models.post_api_sessions_body_mcp_servers import PostApiSessionsBodyMcpServers
from .models.post_api_sessions_body_mcp_servers_additional_property import (
    PostApiSessionsBodyMcpServersAdditionalProperty,
)
from .models.post_api_sessions_body_mcp_servers_additional_property_env import (
    PostApiSessionsBodyMcpServersAdditionalPropertyEnv,
)
from .models.post_api_sessions_body_subagents import PostApiSessionsBodySubagents
from .models.post_api_agents_body import PostApiAgentsBody
from .streaming import AshEvent, parse_sse_stream, parse_sse_stream_async
from .types import UNSET


class AshClient:
    """High-level client for the Ash API with SSE streaming support.

    Example::

        client = AshClient("http://localhost:4100", token="my-api-key")

        # Create a session
        session = client.create_session("my-agent", system_prompt="You are helpful.")

        # Stream messages
        for event in client.send_message_stream(session.id, "Hello!"):
            print(event)

        # Clean up
        client.end_session(session.id)
    """

    def __init__(self, base_url: str, token: str | None = None, *, timeout: float = 300.0):
        """Create an AshClient.

        Args:
            base_url: Ash server URL (e.g. ``http://localhost:4100``).
            token: Optional API key for authenticated access.
            timeout: Request timeout in seconds (default 300s). SSE streams
                     use a separate long-lived timeout.
        """
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout

    def _headers(self, *, content_type: str | None = "application/json", streaming: bool = False) -> dict[str, str]:
        headers: dict[str, str] = {}
        if content_type:
            headers["Content-Type"] = content_type
        if streaming:
            headers["Accept"] = "text/event-stream"
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def _get(self, path: str) -> Any:
        with httpx.Client(timeout=self.timeout) as c:
            r = c.get(f"{self.base_url}{path}", headers=self._headers(content_type=None))
            r.raise_for_status()
            return r.json()

    def _post(self, path: str, json_body: Any = None) -> Any:
        with httpx.Client(timeout=self.timeout) as c:
            r = c.post(f"{self.base_url}{path}", headers=self._headers(), json=json_body)
            r.raise_for_status()
            return r.json()

    def _delete(self, path: str) -> Any:
        with httpx.Client(timeout=self.timeout) as c:
            r = c.delete(f"{self.base_url}{path}", headers=self._headers(content_type=None))
            r.raise_for_status()
            return r.json()

    # -- Health ----------------------------------------------------------------

    def health(self) -> dict[str, Any]:
        """Check server health. Returns the raw health response dict."""
        return self._get("/health")

    # -- Agents ----------------------------------------------------------------

    def deploy_agent(self, name: str, path: str) -> Agent:
        """Deploy an agent from a local directory."""
        data = self._post("/api/agents", {"name": name, "path": path})
        return Agent.from_dict(data["agent"])

    def list_agents(self) -> list[Agent]:
        """List all deployed agents."""
        data = self._get("/api/agents")
        return [Agent.from_dict(a) for a in data["agents"]]

    def get_agent(self, name: str) -> Agent:
        """Get agent details by name."""
        data = self._get(f"/api/agents/{name}")
        return Agent.from_dict(data["agent"])

    def delete_agent(self, name: str) -> None:
        """Delete a deployed agent."""
        self._delete(f"/api/agents/{name}")

    # -- Sessions --------------------------------------------------------------

    def create_session(
        self,
        agent: str,
        *,
        credential_id: str | None = None,
        extra_env: dict[str, str] | None = None,
        startup_script: str | None = None,
        model: str | None = None,
        system_prompt: str | None = None,
        permission_mode: str | None = None,
        allowed_tools: list[str] | None = None,
        disallowed_tools: list[str] | None = None,
        mcp_servers: dict[str, dict[str, Any]] | None = None,
        betas: list[str] | None = None,
        subagents: dict[str, Any] | None = None,
        initial_agent: str | None = None,
    ) -> Session:
        """Create a new session.

        Args:
            agent: Name of the deployed agent.
            credential_id: API credential ID to inject.
            extra_env: Additional environment variables.
            startup_script: Shell script to run after install.
            model: Model override (e.g. ``claude-sonnet-4-20250514``).
            system_prompt: System prompt override (replaces agent CLAUDE.md).
            permission_mode: Permission mode (``bypassPermissions``, ``permissionsByAgent``, ``default``).
            allowed_tools: Whitelist of allowed tool names.
            disallowed_tools: Blacklist of disallowed tool names.
            mcp_servers: Per-session MCP server configs.
            betas: Beta feature flags.
            subagents: Programmatic subagent definitions.
            initial_agent: Which subagent to use for main thread.

        Returns:
            The created Session object.
        """
        body: dict[str, Any] = {"agent": agent}
        if credential_id is not None:
            body["credentialId"] = credential_id
        if extra_env is not None:
            body["extraEnv"] = extra_env
        if startup_script is not None:
            body["startupScript"] = startup_script
        if model is not None:
            body["model"] = model
        if system_prompt is not None:
            body["systemPrompt"] = system_prompt
        if permission_mode is not None:
            body["permissionMode"] = permission_mode
        if allowed_tools is not None:
            body["allowedTools"] = allowed_tools
        if disallowed_tools is not None:
            body["disallowedTools"] = disallowed_tools
        if mcp_servers is not None:
            body["mcpServers"] = mcp_servers
        if betas is not None:
            body["betas"] = betas
        if subagents is not None:
            body["subagents"] = subagents
        if initial_agent is not None:
            body["initialAgent"] = initial_agent

        data = self._post("/api/sessions", body)
        return Session.from_dict(data["session"])

    def list_sessions(self, *, agent: str | None = None, status: str | None = None) -> list[Session]:
        """List sessions, optionally filtered by agent or status."""
        params = []
        if agent:
            params.append(f"agent={agent}")
        if status:
            params.append(f"status={status}")
        qs = f"?{'&'.join(params)}" if params else ""
        data = self._get(f"/api/sessions{qs}")
        return [Session.from_dict(s) for s in data["sessions"]]

    def get_session(self, session_id: str | UUID) -> Session:
        """Get session details."""
        data = self._get(f"/api/sessions/{session_id}")
        return Session.from_dict(data["session"])

    def pause_session(self, session_id: str | UUID) -> Session:
        """Pause a session."""
        data = self._post(f"/api/sessions/{session_id}/pause")
        return Session.from_dict(data["session"])

    def resume_session(self, session_id: str | UUID) -> Session:
        """Resume a paused session."""
        data = self._post(f"/api/sessions/{session_id}/resume")
        return Session.from_dict(data["session"])

    def stop_session(self, session_id: str | UUID) -> Session:
        """Stop a session."""
        data = self._post(f"/api/sessions/{session_id}/stop")
        return Session.from_dict(data["session"])

    def end_session(self, session_id: str | UUID) -> Session:
        """End a session. Stops it first if still active, then deletes."""
        # Stop first — DELETE requires the session to not be active
        try:
            self._post(f"/api/sessions/{session_id}/stop")
        except httpx.HTTPStatusError:
            pass  # Already stopped or in a valid terminal state
        data = self._delete(f"/api/sessions/{session_id}")
        return Session.from_dict(data["session"])

    def fork_session(self, session_id: str | UUID) -> Session:
        """Fork a session, creating a new session with the parent's state."""
        data = self._post(f"/api/sessions/{session_id}/fork")
        return Session.from_dict(data["session"])

    # -- Messages (streaming) --------------------------------------------------

    def send_message_stream(
        self,
        session_id: str | UUID,
        content: str,
        *,
        include_partial_messages: bool = False,
        model: str | None = None,
        max_turns: int | None = None,
        max_budget_usd: float | None = None,
        effort: str | None = None,
        thinking: dict[str, Any] | None = None,
        output_format: dict[str, Any] | None = None,
    ) -> Generator[AshEvent, None, None]:
        """Send a message and stream SSE events (synchronous).

        Args:
            session_id: Target session ID.
            content: Message content.
            include_partial_messages: Include incremental stream deltas.
            model: Model override for this query.
            max_turns: Maximum agentic turns.
            max_budget_usd: Maximum budget in USD.
            effort: Effort level (``low``, ``medium``, ``high``, ``max``).
            thinking: Thinking configuration (e.g. ``{"type": "enabled", "budgetTokens": 10000}``).
            output_format: Output format constraint.

        Yields:
            Typed event objects (MessageEvent, TextDeltaEvent, ErrorEvent, DoneEvent, etc.).
        """
        body: dict[str, Any] = {"content": content}
        if include_partial_messages:
            body["includePartialMessages"] = True
        if model is not None:
            body["model"] = model
        if max_turns is not None:
            body["maxTurns"] = max_turns
        if max_budget_usd is not None:
            body["maxBudgetUsd"] = max_budget_usd
        if effort is not None:
            body["effort"] = effort
        if thinking is not None:
            body["thinking"] = thinking
        if output_format is not None:
            body["outputFormat"] = output_format

        with httpx.Client(timeout=httpx.Timeout(self.timeout, read=None)) as c:
            with c.stream(
                "POST",
                f"{self.base_url}/api/sessions/{session_id}/messages",
                headers=self._headers(streaming=True),
                json=body,
            ) as response:
                response.raise_for_status()
                yield from parse_sse_stream(response)

    async def asend_message_stream(
        self,
        session_id: str | UUID,
        content: str,
        *,
        include_partial_messages: bool = False,
        model: str | None = None,
        max_turns: int | None = None,
        max_budget_usd: float | None = None,
        effort: str | None = None,
        thinking: dict[str, Any] | None = None,
        output_format: dict[str, Any] | None = None,
    ) -> AsyncGenerator[AshEvent, None]:
        """Send a message and stream SSE events (asynchronous).

        Same parameters as ``send_message_stream``.

        Yields:
            Typed event objects (MessageEvent, TextDeltaEvent, ErrorEvent, DoneEvent, etc.).
        """
        body: dict[str, Any] = {"content": content}
        if include_partial_messages:
            body["includePartialMessages"] = True
        if model is not None:
            body["model"] = model
        if max_turns is not None:
            body["maxTurns"] = max_turns
        if max_budget_usd is not None:
            body["maxBudgetUsd"] = max_budget_usd
        if effort is not None:
            body["effort"] = effort
        if thinking is not None:
            body["thinking"] = thinking
        if output_format is not None:
            body["outputFormat"] = output_format

        async with httpx.AsyncClient(timeout=httpx.Timeout(self.timeout, read=None)) as c:
            async with c.stream(
                "POST",
                f"{self.base_url}/api/sessions/{session_id}/messages",
                headers=self._headers(streaming=True),
                json=body,
            ) as response:
                response.raise_for_status()
                async for event in parse_sse_stream_async(response):
                    yield event
