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

T = TypeVar("T", bound="PostApiQueueBody")


@_attrs_define
class PostApiQueueBody:
    """
    Attributes:
        agent_name (str):
        prompt (str):
        session_id (Union[Unset, UUID]):
        priority (Union[Unset, int]):  Default: 0.
        max_retries (Union[Unset, int]):  Default: 3.
    """

    agent_name: str
    prompt: str
    session_id: Union[Unset, UUID] = UNSET
    priority: Union[Unset, int] = 0
    max_retries: Union[Unset, int] = 3
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        agent_name = self.agent_name

        prompt = self.prompt

        session_id: Union[Unset, str] = UNSET
        if not isinstance(self.session_id, Unset):
            session_id = str(self.session_id)

        priority = self.priority

        max_retries = self.max_retries

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "agentName": agent_name,
                "prompt": prompt,
            }
        )
        if session_id is not UNSET:
            field_dict["sessionId"] = session_id
        if priority is not UNSET:
            field_dict["priority"] = priority
        if max_retries is not UNSET:
            field_dict["maxRetries"] = max_retries

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        agent_name = d.pop("agentName")

        prompt = d.pop("prompt")

        _session_id = d.pop("sessionId", UNSET)
        session_id: Union[Unset, UUID]
        if isinstance(_session_id, Unset):
            session_id = UNSET
        else:
            session_id = UUID(_session_id)

        priority = d.pop("priority", UNSET)

        max_retries = d.pop("maxRetries", UNSET)

        post_api_queue_body = cls(
            agent_name=agent_name,
            prompt=prompt,
            session_id=session_id,
            priority=priority,
            max_retries=max_retries,
        )

        post_api_queue_body.additional_properties = d
        return post_api_queue_body

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
