from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.post_api_sessions_body_extra_env import PostApiSessionsBodyExtraEnv


T = TypeVar("T", bound="PostApiSessionsBody")


@_attrs_define
class PostApiSessionsBody:
    """
    Attributes:
        agent (str):
        credential_id (str | Unset):
        extra_env (PostApiSessionsBodyExtraEnv | Unset):
        startup_script (str | Unset):
    """

    agent: str
    credential_id: str | Unset = UNSET
    extra_env: PostApiSessionsBodyExtraEnv | Unset = UNSET
    startup_script: str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        agent = self.agent

        credential_id = self.credential_id

        extra_env: dict[str, Any] | Unset = UNSET
        if not isinstance(self.extra_env, Unset):
            extra_env = self.extra_env.to_dict()

        startup_script = self.startup_script

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "agent": agent,
            }
        )
        if credential_id is not UNSET:
            field_dict["credentialId"] = credential_id
        if extra_env is not UNSET:
            field_dict["extraEnv"] = extra_env
        if startup_script is not UNSET:
            field_dict["startupScript"] = startup_script

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.post_api_sessions_body_extra_env import (
            PostApiSessionsBodyExtraEnv,
        )

        d = dict(src_dict)
        agent = d.pop("agent")

        credential_id = d.pop("credentialId", UNSET)

        _extra_env = d.pop("extraEnv", UNSET)
        extra_env: PostApiSessionsBodyExtraEnv | Unset
        if isinstance(_extra_env, Unset):
            extra_env = UNSET
        else:
            extra_env = PostApiSessionsBodyExtraEnv.from_dict(_extra_env)

        startup_script = d.pop("startupScript", UNSET)

        post_api_sessions_body = cls(
            agent=agent,
            credential_id=credential_id,
            extra_env=extra_env,
            startup_script=startup_script,
        )

        post_api_sessions_body.additional_properties = d
        return post_api_sessions_body

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
