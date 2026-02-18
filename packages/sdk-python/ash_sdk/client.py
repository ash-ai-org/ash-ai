"""Ash Python SDK client.

Thin wrapper around the Ash REST API + SSE streaming, mirroring the TypeScript AshClient.

Usage:
    client = AshClient("http://localhost:4100")
    agent = client.deploy_agent("my-bot", "/path/to/agent")
    session = client.create_session("my-bot")
    for event in client.send_message_stream(session.id, "Hello"):
        print(event)
    client.end_session(session.id)
"""

from __future__ import annotations

from typing import Generator, Optional

import httpx

from ash_sdk.models.agent import Agent
from ash_sdk.models.session import Session
from ash_sdk.models.errors import ApiError
from ash_sdk.streaming import StreamEvent, parse_sse_stream


class AshClient:
    """Synchronous client for the Ash API."""

    def __init__(self, server_url: str, *, api_key: Optional[str] = None, timeout: float = 30.0) -> None:
        self.server_url = server_url.rstrip("/")
        self._api_key = api_key
        self._timeout = timeout

    def _headers(self, json: bool = False) -> dict[str, str]:
        h: dict[str, str] = {}
        if json:
            h["Content-Type"] = "application/json"
        if self._api_key:
            h["Authorization"] = f"Bearer {self._api_key}"
        return h

    def _request(self, method: str, path: str, *, json_body: dict | None = None) -> dict:
        with httpx.Client(timeout=self._timeout) as client:
            resp = client.request(
                method,
                f"{self.server_url}{path}",
                headers=self._headers(json=json_body is not None),
                json=json_body,
            )
        if not resp.is_success:
            try:
                err = resp.json()
            except Exception:
                err = {"error": resp.text, "statusCode": resp.status_code}
            raise ApiError.from_dict(err)
        return resp.json()

    # -- Agents ----------------------------------------------------------------

    def deploy_agent(self, name: str, path: str) -> Agent:
        data = self._request("POST", "/api/agents", json_body={"name": name, "path": path})
        return Agent.from_dict(data["agent"])

    def list_agents(self) -> list[Agent]:
        data = self._request("GET", "/api/agents")
        return [Agent.from_dict(a) for a in data["agents"]]

    def get_agent(self, name: str) -> Agent:
        data = self._request("GET", f"/api/agents/{name}")
        return Agent.from_dict(data["agent"])

    def delete_agent(self, name: str) -> None:
        self._request("DELETE", f"/api/agents/{name}")

    # -- Sessions --------------------------------------------------------------

    def create_session(self, agent: str) -> Session:
        data = self._request("POST", "/api/sessions", json_body={"agent": agent})
        return Session.from_dict(data["session"])

    def list_sessions(self) -> list[Session]:
        data = self._request("GET", "/api/sessions")
        return [Session.from_dict(s) for s in data["sessions"]]

    def get_session(self, session_id: str) -> Session:
        data = self._request("GET", f"/api/sessions/{session_id}")
        return Session.from_dict(data["session"])

    def send_message_stream(
        self,
        session_id: str,
        content: str,
        *,
        include_partial_messages: bool = False,
    ) -> Generator[StreamEvent, None, None]:
        """Send a message and yield SSE events as they arrive."""
        body: dict = {"content": content}
        if include_partial_messages:
            body["includePartialMessages"] = True

        with httpx.Client(timeout=None) as client:
            with client.stream(
                "POST",
                f"{self.server_url}/api/sessions/{session_id}/messages",
                headers=self._headers(json=True),
                json=body,
            ) as resp:
                if not resp.is_success:
                    resp.read()
                    try:
                        err = resp.json()
                    except Exception:
                        err = {"error": resp.text, "statusCode": resp.status_code}
                    raise ApiError.from_dict(err)
                yield from parse_sse_stream(resp)

    def pause_session(self, session_id: str) -> Session:
        data = self._request("POST", f"/api/sessions/{session_id}/pause")
        return Session.from_dict(data["session"])

    def resume_session(self, session_id: str) -> Session:
        data = self._request("POST", f"/api/sessions/{session_id}/resume")
        return Session.from_dict(data["session"])

    def end_session(self, session_id: str) -> Session:
        data = self._request("DELETE", f"/api/sessions/{session_id}")
        return Session.from_dict(data["session"])

    # -- Health ----------------------------------------------------------------

    def health(self) -> dict:
        return self._request("GET", "/health")
