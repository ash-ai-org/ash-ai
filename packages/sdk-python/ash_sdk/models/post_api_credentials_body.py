from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.post_api_credentials_body_type import (
    PostApiCredentialsBodyType,
    check_post_api_credentials_body_type,
)
from ..types import UNSET, Unset

T = TypeVar("T", bound="PostApiCredentialsBody")


@_attrs_define
class PostApiCredentialsBody:
    """
    Attributes:
        type_ (PostApiCredentialsBodyType):
        key (str):
        label (str | Unset):
    """

    type_: PostApiCredentialsBodyType
    key: str
    label: str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        type_: str = self.type_

        key = self.key

        label = self.label

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "type": type_,
                "key": key,
            }
        )
        if label is not UNSET:
            field_dict["label"] = label

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        type_ = check_post_api_credentials_body_type(d.pop("type"))

        key = d.pop("key")

        label = d.pop("label", UNSET)

        post_api_credentials_body = cls(
            type_=type_,
            key=key,
            label=label,
        )

        post_api_credentials_body.additional_properties = d
        return post_api_credentials_body

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
