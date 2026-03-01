from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
    from ..models.post_api_sessions_id_messages_body_output_format_schema import (
        PostApiSessionsIdMessagesBodyOutputFormatSchema,
    )


T = TypeVar("T", bound="PostApiSessionsIdMessagesBodyOutputFormat")


@_attrs_define
class PostApiSessionsIdMessagesBodyOutputFormat:
    """Output format constraint for this query.

    Attributes:
        type_ (str):
        schema (PostApiSessionsIdMessagesBodyOutputFormatSchema):
    """

    type_: str
    schema: PostApiSessionsIdMessagesBodyOutputFormatSchema
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        type_ = self.type_

        schema = self.schema.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "type": type_,
                "schema": schema,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.post_api_sessions_id_messages_body_output_format_schema import (
            PostApiSessionsIdMessagesBodyOutputFormatSchema,
        )

        d = dict(src_dict)
        type_ = d.pop("type")

        schema = PostApiSessionsIdMessagesBodyOutputFormatSchema.from_dict(d.pop("schema"))

        post_api_sessions_id_messages_body_output_format = cls(
            type_=type_,
            schema=schema,
        )

        post_api_sessions_id_messages_body_output_format.additional_properties = d
        return post_api_sessions_id_messages_body_output_format

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
