from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.get_api_sessions_id_logs_response_200_logs_item_level import (
    GetApiSessionsIdLogsResponse200LogsItemLevel,
    check_get_api_sessions_id_logs_response_200_logs_item_level,
)

T = TypeVar("T", bound="GetApiSessionsIdLogsResponse200LogsItem")


@_attrs_define
class GetApiSessionsIdLogsResponse200LogsItem:
    """
    Attributes:
        index (int):
        level (GetApiSessionsIdLogsResponse200LogsItemLevel):
        text (str):
        ts (str):
    """

    index: int
    level: GetApiSessionsIdLogsResponse200LogsItemLevel
    text: str
    ts: str
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        index = self.index

        level: str = self.level

        text = self.text

        ts = self.ts

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "index": index,
                "level": level,
                "text": text,
                "ts": ts,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        index = d.pop("index")

        level = check_get_api_sessions_id_logs_response_200_logs_item_level(d.pop("level"))

        text = d.pop("text")

        ts = d.pop("ts")

        get_api_sessions_id_logs_response_200_logs_item = cls(
            index=index,
            level=level,
            text=text,
            ts=ts,
        )

        get_api_sessions_id_logs_response_200_logs_item.additional_properties = d
        return get_api_sessions_id_logs_response_200_logs_item

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
