from collections.abc import Mapping
from typing import (
    TYPE_CHECKING,
    Any,
    TypeVar,
)

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
    from ..models.attachment import Attachment


T = TypeVar("T", bound="PostApiSessionsIdAttachmentsResponse201")


@_attrs_define
class PostApiSessionsIdAttachmentsResponse201:
    """
    Attributes:
        attachment (Attachment):
    """

    attachment: "Attachment"
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        attachment = self.attachment.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "attachment": attachment,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.attachment import Attachment

        d = dict(src_dict)
        attachment = Attachment.from_dict(d.pop("attachment"))

        post_api_sessions_id_attachments_response_201 = cls(
            attachment=attachment,
        )

        post_api_sessions_id_attachments_response_201.additional_properties = d
        return post_api_sessions_id_attachments_response_201

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
