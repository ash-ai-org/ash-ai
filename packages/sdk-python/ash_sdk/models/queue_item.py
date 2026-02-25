from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

from ..models.queue_item_status import QueueItemStatus, check_queue_item_status
from ..types import UNSET, Unset

T = TypeVar("T", bound="QueueItem")


@_attrs_define
class QueueItem:
    """
    Attributes:
        id (UUID):
        agent_name (str):
        prompt (str):
        status (QueueItemStatus):
        priority (int):
        retry_count (int):
        max_retries (int):
        created_at (datetime.datetime):
        tenant_id (str | Unset):
        session_id (None | str | Unset):
        error (None | str | Unset):
        started_at (None | str | Unset):
        completed_at (None | str | Unset):
    """

    id: UUID
    agent_name: str
    prompt: str
    status: QueueItemStatus
    priority: int
    retry_count: int
    max_retries: int
    created_at: datetime.datetime
    tenant_id: str | Unset = UNSET
    session_id: None | str | Unset = UNSET
    error: None | str | Unset = UNSET
    started_at: None | str | Unset = UNSET
    completed_at: None | str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        id = str(self.id)

        agent_name = self.agent_name

        prompt = self.prompt

        status: str = self.status

        priority = self.priority

        retry_count = self.retry_count

        max_retries = self.max_retries

        created_at = self.created_at.isoformat()

        tenant_id = self.tenant_id

        session_id: None | str | Unset
        if isinstance(self.session_id, Unset):
            session_id = UNSET
        else:
            session_id = self.session_id

        error: None | str | Unset
        if isinstance(self.error, Unset):
            error = UNSET
        else:
            error = self.error

        started_at: None | str | Unset
        if isinstance(self.started_at, Unset):
            started_at = UNSET
        else:
            started_at = self.started_at

        completed_at: None | str | Unset
        if isinstance(self.completed_at, Unset):
            completed_at = UNSET
        else:
            completed_at = self.completed_at

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "id": id,
                "agentName": agent_name,
                "prompt": prompt,
                "status": status,
                "priority": priority,
                "retryCount": retry_count,
                "maxRetries": max_retries,
                "createdAt": created_at,
            }
        )
        if tenant_id is not UNSET:
            field_dict["tenantId"] = tenant_id
        if session_id is not UNSET:
            field_dict["sessionId"] = session_id
        if error is not UNSET:
            field_dict["error"] = error
        if started_at is not UNSET:
            field_dict["startedAt"] = started_at
        if completed_at is not UNSET:
            field_dict["completedAt"] = completed_at

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        id = UUID(d.pop("id"))

        agent_name = d.pop("agentName")

        prompt = d.pop("prompt")

        status = check_queue_item_status(d.pop("status"))

        priority = d.pop("priority")

        retry_count = d.pop("retryCount")

        max_retries = d.pop("maxRetries")

        created_at = isoparse(d.pop("createdAt"))

        tenant_id = d.pop("tenantId", UNSET)

        def _parse_session_id(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        session_id = _parse_session_id(d.pop("sessionId", UNSET))

        def _parse_error(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        error = _parse_error(d.pop("error", UNSET))

        def _parse_started_at(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        started_at = _parse_started_at(d.pop("startedAt", UNSET))

        def _parse_completed_at(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        completed_at = _parse_completed_at(d.pop("completedAt", UNSET))

        queue_item = cls(
            id=id,
            agent_name=agent_name,
            prompt=prompt,
            status=status,
            priority=priority,
            retry_count=retry_count,
            max_retries=max_retries,
            created_at=created_at,
            tenant_id=tenant_id,
            session_id=session_id,
            error=error,
            started_at=started_at,
            completed_at=completed_at,
        )

        queue_item.additional_properties = d
        return queue_item

    @property
    def additional_keys(self) -> list[str]:
        return list(self.additional_properties.keys())

    def __getitem__(self, key: str) -> Any:
        return self.additional_properties[key]

    def __setitem__(self, key: str, value: Any) -> None:
        self.additional_properties[key] = value

    def __delitem__(self, key: str) -> None:
        del self.additional_properties[key]

    def __contains__(self, key: str) -> bool:
        return key in self.additional_properties
