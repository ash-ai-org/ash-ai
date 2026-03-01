from collections.abc import Mapping
from typing import (
    Any,
    TypeVar,
    Union,
    cast,
)

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="GetApiCredentialsResponse200CredentialsItem")


@_attrs_define
class GetApiCredentialsResponse200CredentialsItem:
    """
    Attributes:
        id (Union[Unset, str]):
        type_ (Union[Unset, str]):
        label (Union[Unset, str]):
        active (Union[Unset, bool]):
        created_at (Union[Unset, str]):
        last_used_at (Union[None, Unset, str]):
    """

    id: Union[Unset, str] = UNSET
    type_: Union[Unset, str] = UNSET
    label: Union[Unset, str] = UNSET
    active: Union[Unset, bool] = UNSET
    created_at: Union[Unset, str] = UNSET
    last_used_at: Union[None, Unset, str] = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        type_ = self.type_

        label = self.label

        active = self.active

        created_at = self.created_at

        last_used_at: Union[None, Unset, str]
        if isinstance(self.last_used_at, Unset):
            last_used_at = UNSET
        else:
            last_used_at = self.last_used_at

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if id is not UNSET:
            field_dict["id"] = id
        if type_ is not UNSET:
            field_dict["type"] = type_
        if label is not UNSET:
            field_dict["label"] = label
        if active is not UNSET:
            field_dict["active"] = active
        if created_at is not UNSET:
            field_dict["createdAt"] = created_at
        if last_used_at is not UNSET:
            field_dict["lastUsedAt"] = last_used_at

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        id = d.pop("id", UNSET)

        type_ = d.pop("type", UNSET)

        label = d.pop("label", UNSET)

        active = d.pop("active", UNSET)

        created_at = d.pop("createdAt", UNSET)

        def _parse_last_used_at(data: object) -> Union[None, Unset, str]:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(Union[None, Unset, str], data)

        last_used_at = _parse_last_used_at(d.pop("lastUsedAt", UNSET))

        get_api_credentials_response_200_credentials_item = cls(
            id=id,
            type_=type_,
            label=label,
            active=active,
            created_at=created_at,
            last_used_at=last_used_at,
        )

        get_api_credentials_response_200_credentials_item.additional_properties = d
        return get_api_credentials_response_200_credentials_item

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
