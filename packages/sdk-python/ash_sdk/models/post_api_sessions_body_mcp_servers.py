from collections.abc import Mapping
from typing import (
    TYPE_CHECKING,
    Any,
    TypeVar,
)

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
    from ..models.post_api_sessions_body_mcp_servers_additional_property import (
        PostApiSessionsBodyMcpServersAdditionalProperty,
    )


T = TypeVar("T", bound="PostApiSessionsBodyMcpServers")


@_attrs_define
class PostApiSessionsBodyMcpServers:
    """Per-session MCP servers. Merged into agent .mcp.json (session overrides agent). Enables sidecar pattern."""

    additional_properties: dict[str, "PostApiSessionsBodyMcpServersAdditionalProperty"] = _attrs_field(
        init=False, factory=dict
    )

    def to_dict(self) -> dict[str, Any]:
        field_dict: dict[str, Any] = {}
        for prop_name, prop in self.additional_properties.items():
            field_dict[prop_name] = prop.to_dict()

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.post_api_sessions_body_mcp_servers_additional_property import (
            PostApiSessionsBodyMcpServersAdditionalProperty,
        )

        d = dict(src_dict)
        post_api_sessions_body_mcp_servers = cls()

        additional_properties = {}
        for prop_name, prop_dict in d.items():
            additional_property = PostApiSessionsBodyMcpServersAdditionalProperty.from_dict(prop_dict)

            additional_properties[prop_name] = additional_property

        post_api_sessions_body_mcp_servers.additional_properties = additional_properties
        return post_api_sessions_body_mcp_servers

    @property
    def additional_keys(self) -> list[str]:
        return list(self.additional_properties.keys())

    def __getitem__(self, key: str) -> "PostApiSessionsBodyMcpServersAdditionalProperty":
        return self.additional_properties[key]

    def __setitem__(self, key: str, value: "PostApiSessionsBodyMcpServersAdditionalProperty") -> None:
        self.additional_properties[key] = value

    def __delitem__(self, key: str) -> None:
        del self.additional_properties[key]

    def __contains__(self, key: str) -> bool:
        return key in self.additional_properties
