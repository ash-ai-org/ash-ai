from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="PostApiSessionsIdExecResponse200")


@_attrs_define
class PostApiSessionsIdExecResponse200:
    """
    Attributes:
        exit_code (int):
        stdout (str):
        stderr (str):
    """

    exit_code: int
    stdout: str
    stderr: str
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        exit_code = self.exit_code

        stdout = self.stdout

        stderr = self.stderr

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "exitCode": exit_code,
                "stdout": stdout,
                "stderr": stderr,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        exit_code = d.pop("exitCode")

        stdout = d.pop("stdout")

        stderr = d.pop("stderr")

        post_api_sessions_id_exec_response_200 = cls(
            exit_code=exit_code,
            stdout=stdout,
            stderr=stderr,
        )

        post_api_sessions_id_exec_response_200.additional_properties = d
        return post_api_sessions_id_exec_response_200

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
