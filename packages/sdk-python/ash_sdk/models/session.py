from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


SessionStatus = Literal["starting", "active", "paused", "ended", "error"]


@dataclass
class Session:
    id: str
    agent_name: str
    sandbox_id: str
    status: SessionStatus
    created_at: str
    last_active_at: str

    @classmethod
    def from_dict(cls, data: dict) -> Session:
        return cls(
            id=data["id"],
            agent_name=data["agentName"],
            sandbox_id=data["sandboxId"],
            status=data["status"],
            created_at=data["createdAt"],
            last_active_at=data["lastActiveAt"],
        )
