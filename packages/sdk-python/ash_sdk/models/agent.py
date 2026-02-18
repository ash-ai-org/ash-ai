from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Agent:
    name: str
    version: int
    path: str
    created_at: str
    updated_at: str

    @classmethod
    def from_dict(cls, data: dict) -> Agent:
        return cls(
            name=data["name"],
            version=data["version"],
            path=data["path"],
            created_at=data["createdAt"],
            updated_at=data["updatedAt"],
        )
