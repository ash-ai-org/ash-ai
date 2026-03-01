from collections.abc import Mapping
from typing import (
    TYPE_CHECKING,
    Any,
    TypeVar,
    Union,
)

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.get_api_credentials_response_200_credentials_item import (
        GetApiCredentialsResponse200CredentialsItem,
    )


T = TypeVar("T", bound="GetApiCredentialsResponse200")


@_attrs_define
class GetApiCredentialsResponse200:
    """
    Attributes:
        credentials (Union[Unset, list['GetApiCredentialsResponse200CredentialsItem']]):
    """

    credentials: Union[Unset, list["GetApiCredentialsResponse200CredentialsItem"]] = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        credentials: Union[Unset, list[dict[str, Any]]] = UNSET
        if not isinstance(self.credentials, Unset):
            credentials = []
            for credentials_item_data in self.credentials:
                credentials_item = credentials_item_data.to_dict()
                credentials.append(credentials_item)

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if credentials is not UNSET:
            field_dict["credentials"] = credentials

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.get_api_credentials_response_200_credentials_item import (
            GetApiCredentialsResponse200CredentialsItem,
        )

        d = dict(src_dict)
        credentials = []
        _credentials = d.pop("credentials", UNSET)
        for credentials_item_data in _credentials or []:
            credentials_item = GetApiCredentialsResponse200CredentialsItem.from_dict(credentials_item_data)

            credentials.append(credentials_item)

        get_api_credentials_response_200 = cls(
            credentials=credentials,
        )

        get_api_credentials_response_200.additional_properties = d
        return get_api_credentials_response_200

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
