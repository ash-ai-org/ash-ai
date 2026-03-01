from collections.abc import Mapping
from typing import (
    Any,
    TypeVar,
    Union,
)

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="PostApiSessionsIdMessagesBodyThinking")


@_attrs_define
class PostApiSessionsIdMessagesBodyThinking:
    """Thinking configuration for this query.

    Attributes:
        type_ (str):
        budget_tokens (Union[Unset, int]):
    """

    type_: str
    budget_tokens: Union[Unset, int] = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        type_ = self.type_

        budget_tokens = self.budget_tokens

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "type": type_,
            }
        )
        if budget_tokens is not UNSET:
            field_dict["budgetTokens"] = budget_tokens

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        type_ = d.pop("type")

        budget_tokens = d.pop("budgetTokens", UNSET)

        post_api_sessions_id_messages_body_thinking = cls(
            type_=type_,
            budget_tokens=budget_tokens,
        )

        post_api_sessions_id_messages_body_thinking.additional_properties = d
        return post_api_sessions_id_messages_body_thinking

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
