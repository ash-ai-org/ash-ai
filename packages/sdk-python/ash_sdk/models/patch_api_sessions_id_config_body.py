from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.patch_api_sessions_id_config_body_subagents import (
        PatchApiSessionsIdConfigBodySubagents,
    )


T = TypeVar("T", bound="PatchApiSessionsIdConfigBody")


@_attrs_define
class PatchApiSessionsIdConfigBody:
    """
    Attributes:
        model (str | Unset): Model override for subsequent queries.
        allowed_tools (list[str] | Unset): Whitelist of allowed tool names.
        disallowed_tools (list[str] | Unset): Blacklist of disallowed tool names.
        betas (list[str] | Unset): Beta feature flags.
        subagents (PatchApiSessionsIdConfigBodySubagents | Unset): Programmatic subagent definitions.
        initial_agent (str | Unset): Which subagent to use for the main thread.
    """

    model: str | Unset = UNSET
    allowed_tools: list[str] | Unset = UNSET
    disallowed_tools: list[str] | Unset = UNSET
    betas: list[str] | Unset = UNSET
    subagents: PatchApiSessionsIdConfigBodySubagents | Unset = UNSET
    initial_agent: str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        model = self.model

        allowed_tools: list[str] | Unset = UNSET
        if not isinstance(self.allowed_tools, Unset):
            allowed_tools = self.allowed_tools

        disallowed_tools: list[str] | Unset = UNSET
        if not isinstance(self.disallowed_tools, Unset):
            disallowed_tools = self.disallowed_tools

        betas: list[str] | Unset = UNSET
        if not isinstance(self.betas, Unset):
            betas = self.betas

        subagents: dict[str, Any] | Unset = UNSET
        if not isinstance(self.subagents, Unset):
            subagents = self.subagents.to_dict()

        initial_agent = self.initial_agent

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if model is not UNSET:
            field_dict["model"] = model
        if allowed_tools is not UNSET:
            field_dict["allowedTools"] = allowed_tools
        if disallowed_tools is not UNSET:
            field_dict["disallowedTools"] = disallowed_tools
        if betas is not UNSET:
            field_dict["betas"] = betas
        if subagents is not UNSET:
            field_dict["subagents"] = subagents
        if initial_agent is not UNSET:
            field_dict["initialAgent"] = initial_agent

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.patch_api_sessions_id_config_body_subagents import (
            PatchApiSessionsIdConfigBodySubagents,
        )

        d = dict(src_dict)
        model = d.pop("model", UNSET)

        allowed_tools = cast(list[str], d.pop("allowedTools", UNSET))

        disallowed_tools = cast(list[str], d.pop("disallowedTools", UNSET))

        betas = cast(list[str], d.pop("betas", UNSET))

        _subagents = d.pop("subagents", UNSET)
        subagents: PatchApiSessionsIdConfigBodySubagents | Unset
        if isinstance(_subagents, Unset):
            subagents = UNSET
        else:
            subagents = PatchApiSessionsIdConfigBodySubagents.from_dict(_subagents)

        initial_agent = d.pop("initialAgent", UNSET)

        patch_api_sessions_id_config_body = cls(
            model=model,
            allowed_tools=allowed_tools,
            disallowed_tools=disallowed_tools,
            betas=betas,
            subagents=subagents,
            initial_agent=initial_agent,
        )

        patch_api_sessions_id_config_body.additional_properties = d
        return patch_api_sessions_id_config_body

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
