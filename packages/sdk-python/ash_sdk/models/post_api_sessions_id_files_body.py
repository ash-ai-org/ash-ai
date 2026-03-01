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
    from ..models.post_api_sessions_id_files_body_files_item import (
        PostApiSessionsIdFilesBodyFilesItem,
    )


T = TypeVar("T", bound="PostApiSessionsIdFilesBody")


@_attrs_define
class PostApiSessionsIdFilesBody:
    """
    Attributes:
        files (list['PostApiSessionsIdFilesBodyFilesItem']):
        target_path (Union[Unset, str]):  Default: '.'.
    """

    files: list["PostApiSessionsIdFilesBodyFilesItem"]
    target_path: Union[Unset, str] = "."
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        files = []
        for files_item_data in self.files:
            files_item = files_item_data.to_dict()
            files.append(files_item)

        target_path = self.target_path

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "files": files,
            }
        )
        if target_path is not UNSET:
            field_dict["targetPath"] = target_path

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.post_api_sessions_id_files_body_files_item import (
            PostApiSessionsIdFilesBodyFilesItem,
        )

        d = dict(src_dict)
        files = []
        _files = d.pop("files")
        for files_item_data in _files:
            files_item = PostApiSessionsIdFilesBodyFilesItem.from_dict(files_item_data)

            files.append(files_item)

        target_path = d.pop("targetPath", UNSET)

        post_api_sessions_id_files_body = cls(
            files=files,
            target_path=target_path,
        )

        post_api_sessions_id_files_body.additional_properties = d
        return post_api_sessions_id_files_body

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
