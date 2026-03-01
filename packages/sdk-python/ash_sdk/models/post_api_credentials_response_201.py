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
    from ..models.post_api_credentials_response_201_credential import (
        PostApiCredentialsResponse201Credential,
    )


T = TypeVar("T", bound="PostApiCredentialsResponse201")


@_attrs_define
class PostApiCredentialsResponse201:
    """
    Attributes:
        credential (Union[Unset, PostApiCredentialsResponse201Credential]):
    """

    credential: Union[Unset, "PostApiCredentialsResponse201Credential"] = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        credential: Union[Unset, dict[str, Any]] = UNSET
        if not isinstance(self.credential, Unset):
            credential = self.credential.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if credential is not UNSET:
            field_dict["credential"] = credential

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.post_api_credentials_response_201_credential import (
            PostApiCredentialsResponse201Credential,
        )

        d = dict(src_dict)
        _credential = d.pop("credential", UNSET)
        credential: Union[Unset, PostApiCredentialsResponse201Credential]
        if isinstance(_credential, Unset):
            credential = UNSET
        else:
            credential = PostApiCredentialsResponse201Credential.from_dict(_credential)

        post_api_credentials_response_201 = cls(
            credential=credential,
        )

        post_api_credentials_response_201.additional_properties = d
        return post_api_credentials_response_201

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
