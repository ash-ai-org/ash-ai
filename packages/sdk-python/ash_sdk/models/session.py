from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

from ..models.session_status import SessionStatus, check_session_status
from ..types import UNSET, Unset

T = TypeVar("T", bound="Session")


@_attrs_define
class Session:
    """
    Attributes:
        id (UUID):
        agent_name (str):
        sandbox_id (str):
        status (SessionStatus):
        created_at (datetime.datetime):
        last_active_at (datetime.datetime):
        tenant_id (str | Unset):
        runner_id (None | str | Unset):
        parent_session_id (None | Unset | UUID):
    """

    id: UUID
    agent_name: str
    sandbox_id: str
    status: SessionStatus
    created_at: datetime.datetime
    last_active_at: datetime.datetime
    tenant_id: str | Unset = UNSET
    runner_id: None | str | Unset = UNSET
    parent_session_id: None | Unset | UUID = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        id = str(self.id)

        agent_name = self.agent_name

        sandbox_id = self.sandbox_id

        status: str = self.status

        created_at = self.created_at.isoformat()

        last_active_at = self.last_active_at.isoformat()

        tenant_id = self.tenant_id

        runner_id: None | str | Unset
        if isinstance(self.runner_id, Unset):
            runner_id = UNSET
        else:
            runner_id = self.runner_id

        parent_session_id: None | str | Unset
        if isinstance(self.parent_session_id, Unset):
            parent_session_id = UNSET
        elif isinstance(self.parent_session_id, UUID):
            parent_session_id = str(self.parent_session_id)
        else:
            parent_session_id = self.parent_session_id

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "id": id,
                "agentName": agent_name,
                "sandboxId": sandbox_id,
                "status": status,
                "createdAt": created_at,
                "lastActiveAt": last_active_at,
            }
        )
        if tenant_id is not UNSET:
            field_dict["tenantId"] = tenant_id
        if runner_id is not UNSET:
            field_dict["runnerId"] = runner_id
        if parent_session_id is not UNSET:
            field_dict["parentSessionId"] = parent_session_id

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        id = UUID(d.pop("id"))

        agent_name = d.pop("agentName")

        sandbox_id = d.pop("sandboxId")

        status = check_session_status(d.pop("status"))

        created_at = isoparse(d.pop("createdAt"))

        last_active_at = isoparse(d.pop("lastActiveAt"))

        tenant_id = d.pop("tenantId", UNSET)

        def _parse_runner_id(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        runner_id = _parse_runner_id(d.pop("runnerId", UNSET))

        def _parse_parent_session_id(data: object) -> None | Unset | UUID:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                parent_session_id_type_1 = UUID(data)

                return parent_session_id_type_1
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | Unset | UUID, data)

        parent_session_id = _parse_parent_session_id(d.pop("parentSessionId", UNSET))

        session = cls(
            id=id,
            agent_name=agent_name,
            sandbox_id=sandbox_id,
            status=status,
            created_at=created_at,
            last_active_at=last_active_at,
            tenant_id=tenant_id,
            runner_id=runner_id,
            parent_session_id=parent_session_id,
        )

        session.additional_properties = d
        return session

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
