from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="GetApiQueueStatsResponse200Stats")


@_attrs_define
class GetApiQueueStatsResponse200Stats:
    """
    Attributes:
        pending (int):
        processing (int):
        completed (int):
        failed (int):
        cancelled (int):
    """

    pending: int
    processing: int
    completed: int
    failed: int
    cancelled: int
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        pending = self.pending

        processing = self.processing

        completed = self.completed

        failed = self.failed

        cancelled = self.cancelled

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "pending": pending,
                "processing": processing,
                "completed": completed,
                "failed": failed,
                "cancelled": cancelled,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        pending = d.pop("pending")

        processing = d.pop("processing")

        completed = d.pop("completed")

        failed = d.pop("failed")

        cancelled = d.pop("cancelled")

        get_api_queue_stats_response_200_stats = cls(
            pending=pending,
            processing=processing,
            completed=completed,
            failed=failed,
            cancelled=cancelled,
        )

        get_api_queue_stats_response_200_stats.additional_properties = d
        return get_api_queue_stats_response_200_stats

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
