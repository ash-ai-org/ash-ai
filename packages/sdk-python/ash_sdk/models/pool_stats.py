from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="PoolStats")


@_attrs_define
class PoolStats:
    """
    Attributes:
        total (int):
        cold (int):
        warming (int):
        warm (int):
        waiting (int):
        running (int):
        max_capacity (int):
        resume_warm_hits (int):
        resume_cold_hits (int):
        pre_warm_hits (int):
    """

    total: int
    cold: int
    warming: int
    warm: int
    waiting: int
    running: int
    max_capacity: int
    resume_warm_hits: int
    resume_cold_hits: int
    pre_warm_hits: int
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        total = self.total

        cold = self.cold

        warming = self.warming

        warm = self.warm

        waiting = self.waiting

        running = self.running

        max_capacity = self.max_capacity

        resume_warm_hits = self.resume_warm_hits

        resume_cold_hits = self.resume_cold_hits

        pre_warm_hits = self.pre_warm_hits

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "total": total,
                "cold": cold,
                "warming": warming,
                "warm": warm,
                "waiting": waiting,
                "running": running,
                "maxCapacity": max_capacity,
                "resumeWarmHits": resume_warm_hits,
                "resumeColdHits": resume_cold_hits,
                "preWarmHits": pre_warm_hits,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        total = d.pop("total")

        cold = d.pop("cold")

        warming = d.pop("warming")

        warm = d.pop("warm")

        waiting = d.pop("waiting")

        running = d.pop("running")

        max_capacity = d.pop("maxCapacity")

        resume_warm_hits = d.pop("resumeWarmHits")

        resume_cold_hits = d.pop("resumeColdHits")

        pre_warm_hits = d.pop("preWarmHits")

        pool_stats = cls(
            total=total,
            cold=cold,
            warming=warming,
            warm=warm,
            waiting=waiting,
            running=running,
            max_capacity=max_capacity,
            resume_warm_hits=resume_warm_hits,
            resume_cold_hits=resume_cold_hits,
            pre_warm_hits=pre_warm_hits,
        )

        pool_stats.additional_properties = d
        return pool_stats

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
