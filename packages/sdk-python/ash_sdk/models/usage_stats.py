from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="UsageStats")


@_attrs_define
class UsageStats:
    """
    Attributes:
        total_input_tokens (float):
        total_output_tokens (float):
        total_cache_creation_tokens (float):
        total_cache_read_tokens (float):
        total_tool_calls (float):
        total_messages (float):
        total_compute_seconds (float):
    """

    total_input_tokens: float
    total_output_tokens: float
    total_cache_creation_tokens: float
    total_cache_read_tokens: float
    total_tool_calls: float
    total_messages: float
    total_compute_seconds: float
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        total_input_tokens = self.total_input_tokens

        total_output_tokens = self.total_output_tokens

        total_cache_creation_tokens = self.total_cache_creation_tokens

        total_cache_read_tokens = self.total_cache_read_tokens

        total_tool_calls = self.total_tool_calls

        total_messages = self.total_messages

        total_compute_seconds = self.total_compute_seconds

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "totalInputTokens": total_input_tokens,
                "totalOutputTokens": total_output_tokens,
                "totalCacheCreationTokens": total_cache_creation_tokens,
                "totalCacheReadTokens": total_cache_read_tokens,
                "totalToolCalls": total_tool_calls,
                "totalMessages": total_messages,
                "totalComputeSeconds": total_compute_seconds,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        total_input_tokens = d.pop("totalInputTokens")

        total_output_tokens = d.pop("totalOutputTokens")

        total_cache_creation_tokens = d.pop("totalCacheCreationTokens")

        total_cache_read_tokens = d.pop("totalCacheReadTokens")

        total_tool_calls = d.pop("totalToolCalls")

        total_messages = d.pop("totalMessages")

        total_compute_seconds = d.pop("totalComputeSeconds")

        usage_stats = cls(
            total_input_tokens=total_input_tokens,
            total_output_tokens=total_output_tokens,
            total_cache_creation_tokens=total_cache_creation_tokens,
            total_cache_read_tokens=total_cache_read_tokens,
            total_tool_calls=total_tool_calls,
            total_messages=total_messages,
            total_compute_seconds=total_compute_seconds,
        )

        usage_stats.additional_properties = d
        return usage_stats

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
