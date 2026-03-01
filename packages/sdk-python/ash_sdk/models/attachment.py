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

T = TypeVar("T", bound="Attachment")


@_attrs_define
class Attachment:
    """
    Attributes:
        id (UUID):
        session_id (UUID):
        filename (str):
        mime_type (str):
        size (int):
        created_at (datetime.datetime):
        tenant_id (Union[Unset, str]):
        message_id (Union[Unset, str]):
    """

    id: UUID
    session_id: UUID
    filename: str
    mime_type: str
    size: int
    created_at: datetime.datetime
    tenant_id: Union[Unset, str] = UNSET
    message_id: Union[Unset, str] = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        id = str(self.id)

        session_id = str(self.session_id)

        filename = self.filename

        mime_type = self.mime_type

        size = self.size

        created_at = self.created_at.isoformat()

        tenant_id = self.tenant_id

        message_id = self.message_id

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "id": id,
                "sessionId": session_id,
                "filename": filename,
                "mimeType": mime_type,
                "size": size,
                "createdAt": created_at,
            }
        )
        if tenant_id is not UNSET:
            field_dict["tenantId"] = tenant_id
        if message_id is not UNSET:
            field_dict["messageId"] = message_id

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        id = UUID(d.pop("id"))

        session_id = UUID(d.pop("sessionId"))

        filename = d.pop("filename")

        mime_type = d.pop("mimeType")

        size = d.pop("size")

        created_at = isoparse(d.pop("createdAt"))

        tenant_id = d.pop("tenantId", UNSET)

        message_id = d.pop("messageId", UNSET)

        attachment = cls(
            id=id,
            session_id=session_id,
            filename=filename,
            mime_type=mime_type,
            size=size,
            created_at=created_at,
            tenant_id=tenant_id,
            message_id=message_id,
        )

        attachment.additional_properties = d
        return attachment

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
