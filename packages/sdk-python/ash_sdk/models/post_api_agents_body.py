from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.post_api_agents_body_files_item import PostApiAgentsBodyFilesItem


T = TypeVar("T", bound="PostApiAgentsBody")


@_attrs_define
class PostApiAgentsBody:
    """
    Attributes:
        name (str):
        path (str | Unset):
        system_prompt (str | Unset):
        files (list[PostApiAgentsBodyFilesItem] | Unset):
    """

    name: str
    path: str | Unset = UNSET
    system_prompt: str | Unset = UNSET
    files: list[PostApiAgentsBodyFilesItem] | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        name = self.name

        path = self.path

        system_prompt = self.system_prompt

        files: list[dict[str, Any]] | Unset = UNSET
        if not isinstance(self.files, Unset):
            files = []
            for files_item_data in self.files:
                files_item = files_item_data.to_dict()
                files.append(files_item)

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "name": name,
            }
        )
        if path is not UNSET:
            field_dict["path"] = path
        if system_prompt is not UNSET:
            field_dict["systemPrompt"] = system_prompt
        if files is not UNSET:
            field_dict["files"] = files

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.post_api_agents_body_files_item import PostApiAgentsBodyFilesItem

        d = dict(src_dict)
        name = d.pop("name")

        path = d.pop("path", UNSET)

        system_prompt = d.pop("systemPrompt", UNSET)

        _files = d.pop("files", UNSET)
        files: list[PostApiAgentsBodyFilesItem] | Unset = UNSET
        if _files is not UNSET:
            files = []
            for files_item_data in _files:
                files_item = PostApiAgentsBodyFilesItem.from_dict(files_item_data)

                files.append(files_item)

        post_api_agents_body = cls(
            name=name,
            path=path,
            system_prompt=system_prompt,
            files=files,
        )

        post_api_agents_body.additional_properties = d
        return post_api_agents_body

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
