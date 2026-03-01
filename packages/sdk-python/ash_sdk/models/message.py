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

from ..models.message_role import MessageRole, check_message_role
from ..types import UNSET, Unset

T = TypeVar("T", bound="Message")


@_attrs_define
class Message:
    """
    Attributes:
        id (UUID):
        session_id (UUID):
        role (MessageRole):
        content (str): JSON-encoded message content (SDK passthrough)
        sequence (int):
        created_at (datetime.datetime):
        tenant_id (Union[Unset, str]):
    """

    id: UUID
    session_id: UUID
    role: MessageRole
    content: str
    sequence: int
    created_at: datetime.datetime
    tenant_id: Union[Unset, str] = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        id = str(self.id)

        session_id = str(self.session_id)

        role: str = self.role

        content = self.content

        sequence = self.sequence

        created_at = self.created_at.isoformat()

        tenant_id = self.tenant_id

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "id": id,
                "sessionId": session_id,
                "role": role,
                "content": content,
                "sequence": sequence,
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

        role = check_message_role(d.pop("role"))

        content = d.pop("content")

        sequence = d.pop("sequence")

        created_at = isoparse(d.pop("createdAt"))

        tenant_id = d.pop("tenantId", UNSET)

        message = cls(
            id=id,
            session_id=session_id,
            role=role,
            content=content,
            sequence=sequence,
            created_at=created_at,
            tenant_id=tenant_id,
        )

        message.additional_properties = d
        return message

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
