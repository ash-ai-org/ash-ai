from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.post_api_sessions_body_mcp_servers_additional_property_env import (
        PostApiSessionsBodyMcpServersAdditionalPropertyEnv,
    )


T = TypeVar("T", bound="PostApiSessionsBodyMcpServersAdditionalProperty")


@_attrs_define
class PostApiSessionsBodyMcpServersAdditionalProperty:
    """
    Attributes:
        url (str | Unset):
        command (str | Unset):
        args (list[str] | Unset):
        env (PostApiSessionsBodyMcpServersAdditionalPropertyEnv | Unset):
    """

    url: str | Unset = UNSET
    command: str | Unset = UNSET
    args: list[str] | Unset = UNSET
    env: PostApiSessionsBodyMcpServersAdditionalPropertyEnv | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        url = self.url

        command = self.command

        args: list[str] | Unset = UNSET
        if not isinstance(self.args, Unset):
            args = self.args

        env: dict[str, Any] | Unset = UNSET
        if not isinstance(self.env, Unset):
            env = self.env.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if url is not UNSET:
            field_dict["url"] = url
        if command is not UNSET:
            field_dict["command"] = command
        if args is not UNSET:
            field_dict["args"] = args
        if env is not UNSET:
            field_dict["env"] = env

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.post_api_sessions_body_mcp_servers_additional_property_env import (
            PostApiSessionsBodyMcpServersAdditionalPropertyEnv,
        )

        d = dict(src_dict)
        url = d.pop("url", UNSET)

        command = d.pop("command", UNSET)

        args = cast(list[str], d.pop("args", UNSET))

        _env = d.pop("env", UNSET)
        env: PostApiSessionsBodyMcpServersAdditionalPropertyEnv | Unset
        if isinstance(_env, Unset):
            env = UNSET
        else:
            env = PostApiSessionsBodyMcpServersAdditionalPropertyEnv.from_dict(_env)

        post_api_sessions_body_mcp_servers_additional_property = cls(
            url=url,
            command=command,
            args=args,
            env=env,
        )

        post_api_sessions_body_mcp_servers_additional_property.additional_properties = d
        return post_api_sessions_body_mcp_servers_additional_property

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
