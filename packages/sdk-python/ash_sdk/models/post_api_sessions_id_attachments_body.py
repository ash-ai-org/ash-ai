from collections.abc import Mapping
from typing import (
    Any,
    TypeVar,
    Union,
)
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="PostApiSessionsIdAttachmentsBody")


@_attrs_define
class PostApiSessionsIdAttachmentsBody:
    """
    Attributes:
        filename (str):
        content (str): Base64-encoded file content
        mime_type (Union[Unset, str]):  Default: 'application/octet-stream'.
        message_id (Union[Unset, UUID]): Message to attach to (optional — can be linked later)
    """

    filename: str
    content: str
    mime_type: Union[Unset, str] = "application/octet-stream"
    message_id: Union[Unset, UUID] = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        filename = self.filename

        content = self.content

        mime_type = self.mime_type

        message_id: Union[Unset, str] = UNSET
        if not isinstance(self.message_id, Unset):
            message_id = str(self.message_id)

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "filename": filename,
                "content": content,
            }
        )
        if mime_type is not UNSET:
            field_dict["mimeType"] = mime_type
        if message_id is not UNSET:
            field_dict["messageId"] = message_id

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        filename = d.pop("filename")

        content = d.pop("content")

        mime_type = d.pop("mimeType", UNSET)

        _message_id = d.pop("messageId", UNSET)
        message_id: Union[Unset, UUID]
        if isinstance(_message_id, Unset):
            message_id = UNSET
        else:
            message_id = UUID(_message_id)

        post_api_sessions_id_attachments_body = cls(
            filename=filename,
            content=content,
            mime_type=mime_type,
            message_id=message_id,
        )

        post_api_sessions_id_attachments_body.additional_properties = d
        return post_api_sessions_id_attachments_body

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
