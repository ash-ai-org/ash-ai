from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.get_api_sessions_id_files_response_200_source import (
    GetApiSessionsIdFilesResponse200Source,
    check_get_api_sessions_id_files_response_200_source,
)

if TYPE_CHECKING:
    from ..models.get_api_sessions_id_files_response_200_files_item import (
        GetApiSessionsIdFilesResponse200FilesItem,
    )


T = TypeVar("T", bound="GetApiSessionsIdFilesResponse200")


@_attrs_define
class GetApiSessionsIdFilesResponse200:
    """
    Attributes:
        files (list[GetApiSessionsIdFilesResponse200FilesItem]):
        source (GetApiSessionsIdFilesResponse200Source):
    """

    files: list[GetApiSessionsIdFilesResponse200FilesItem]
    source: GetApiSessionsIdFilesResponse200Source
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        files = []
        for files_item_data in self.files:
            files_item = files_item_data.to_dict()
            files.append(files_item)

        source: str = self.source

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "files": files,
                "source": source,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.get_api_sessions_id_files_response_200_files_item import (
            GetApiSessionsIdFilesResponse200FilesItem,
        )

        d = dict(src_dict)
        files = []
        _files = d.pop("files")
        for files_item_data in _files:
            files_item = GetApiSessionsIdFilesResponse200FilesItem.from_dict(files_item_data)

            files.append(files_item)

        source = check_get_api_sessions_id_files_response_200_source(d.pop("source"))

        get_api_sessions_id_files_response_200 = cls(
            files=files,
            source=source,
        )

        get_api_sessions_id_files_response_200.additional_properties = d
        return get_api_sessions_id_files_response_200

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
