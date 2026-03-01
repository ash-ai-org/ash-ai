from collections.abc import Mapping
from typing import (
    TYPE_CHECKING,
    Any,
    TypeVar,
    Union,
)

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.health_response_status import (
    HealthResponseStatus,
    check_health_response_status,
)
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.pool_stats import PoolStats


T = TypeVar("T", bound="HealthResponse")


@_attrs_define
class HealthResponse:
    """
    Attributes:
        status (HealthResponseStatus):
        active_sessions (int):
        active_sandboxes (int):
        uptime (int): Seconds since process start
        pool (PoolStats):
        version (Union[Unset, str]): Ash server version
        coordinator_id (Union[Unset, str]): Unique coordinator ID (hostname-PID)
        remote_runners (Union[Unset, int]): Number of registered remote runners
    """

    status: HealthResponseStatus
    active_sessions: int
    active_sandboxes: int
    uptime: int
    pool: "PoolStats"
    version: Union[Unset, str] = UNSET
    coordinator_id: Union[Unset, str] = UNSET
    remote_runners: Union[Unset, int] = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        status: str = self.status

        active_sessions = self.active_sessions

        active_sandboxes = self.active_sandboxes

        uptime = self.uptime

        pool = self.pool.to_dict()

        version = self.version

        coordinator_id = self.coordinator_id

        remote_runners = self.remote_runners

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "status": status,
                "activeSessions": active_sessions,
                "activeSandboxes": active_sandboxes,
                "uptime": uptime,
                "pool": pool,
            }
        )
        if version is not UNSET:
            field_dict["version"] = version
        if coordinator_id is not UNSET:
            field_dict["coordinatorId"] = coordinator_id
        if remote_runners is not UNSET:
            field_dict["remoteRunners"] = remote_runners

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.pool_stats import PoolStats

        d = dict(src_dict)
        status = check_health_response_status(d.pop("status"))

        active_sessions = d.pop("activeSessions")

        active_sandboxes = d.pop("activeSandboxes")

        uptime = d.pop("uptime")

        pool = PoolStats.from_dict(d.pop("pool"))

        version = d.pop("version", UNSET)

        coordinator_id = d.pop("coordinatorId", UNSET)

        remote_runners = d.pop("remoteRunners", UNSET)

        health_response = cls(
            status=status,
            active_sessions=active_sessions,
            active_sandboxes=active_sandboxes,
            uptime=uptime,
            pool=pool,
            version=version,
            coordinator_id=coordinator_id,
            remote_runners=remote_runners,
        )

        health_response.additional_properties = d
        return health_response

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
