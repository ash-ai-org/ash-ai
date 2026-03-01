import datetime
from collections.abc import Mapping
from typing import (
    Any,
    TypeVar,
    Union,
)
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

from ..types import UNSET, Unset

T = TypeVar("T", bound="UsageEvent")


@_attrs_define
class UsageEvent:
    """
    Attributes:
        id (UUID):
        session_id (UUID):
        agent_name (str):
        event_type (str):
        value (float):
        created_at (datetime.datetime):
        tenant_id (Union[Unset, str]):
    """

    id: UUID
    session_id: UUID
    agent_name: str
    event_type: str
    value: float
    created_at: datetime.datetime
    tenant_id: Union[Unset, str] = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        id = str(self.id)

        session_id = str(self.session_id)

        agent_name = self.agent_name

        event_type = self.event_type

        value = self.value

        created_at = self.created_at.isoformat()

        tenant_id = self.tenant_id

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "id": id,
                "sessionId": session_id,
                "agentName": agent_name,
                "eventType": event_type,
                "value": value,
                "createdAt": created_at,
            }
        )
        if tenant_id is not UNSET:
            field_dict["tenantId"] = tenant_id

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        id = UUID(d.pop("id"))

        session_id = UUID(d.pop("sessionId"))

        agent_name = d.pop("agentName")

        event_type = d.pop("eventType")

        value = d.pop("value")

        created_at = isoparse(d.pop("createdAt"))

        tenant_id = d.pop("tenantId", UNSET)

        usage_event = cls(
            id=id,
            session_id=session_id,
            agent_name=agent_name,
            event_type=event_type,
            value=value,
            created_at=created_at,
            tenant_id=tenant_id,
        )

        usage_event.additional_properties = d
        return usage_event

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
