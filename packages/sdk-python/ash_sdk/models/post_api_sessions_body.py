from collections.abc import Mapping
from typing import (
    TYPE_CHECKING,
    Any,
    TypeVar,
    Union,
    cast,
)

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.post_api_sessions_body_permission_mode import (
    PostApiSessionsBodyPermissionMode,
    check_post_api_sessions_body_permission_mode,
)
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.post_api_sessions_body_extra_env import PostApiSessionsBodyExtraEnv
    from ..models.post_api_sessions_body_mcp_servers import (
        PostApiSessionsBodyMcpServers,
    )
    from ..models.post_api_sessions_body_subagents import PostApiSessionsBodySubagents


T = TypeVar("T", bound="PostApiSessionsBody")


@_attrs_define
class PostApiSessionsBody:
    """
    Attributes:
        agent (str):
        credential_id (Union[Unset, str]):
        extra_env (Union[Unset, PostApiSessionsBodyExtraEnv]):
        startup_script (Union[Unset, str]):
        model (Union[Unset, str]): Model override for this session. Overrides agent .claude/settings.json default.
        mcp_servers (Union[Unset, PostApiSessionsBodyMcpServers]): Per-session MCP servers. Merged into agent .mcp.json
            (session overrides agent). Enables sidecar pattern.
        system_prompt (Union[Unset, str]): System prompt override. Replaces agent CLAUDE.md for this session.
        permission_mode (Union[Unset, PostApiSessionsBodyPermissionMode]): Permission mode for the SDK inside the
            sandbox. Defaults to bypassPermissions (sandbox isolation is the security boundary).
        allowed_tools (Union[Unset, list[str]]): Whitelist of allowed tool names for this session.
        disallowed_tools (Union[Unset, list[str]]): Blacklist of disallowed tool names for this session.
        betas (Union[Unset, list[str]]): Beta feature flags for this session.
        subagents (Union[Unset, PostApiSessionsBodySubagents]): Programmatic subagent definitions. Passed through to the
            SDK as `agents`.
        initial_agent (Union[Unset, str]): Which subagent to use for the main thread. Maps to SDK `agent` option.
    """

    agent: str
    credential_id: Union[Unset, str] = UNSET
    extra_env: Union[Unset, "PostApiSessionsBodyExtraEnv"] = UNSET
    startup_script: Union[Unset, str] = UNSET
    model: Union[Unset, str] = UNSET
    mcp_servers: Union[Unset, "PostApiSessionsBodyMcpServers"] = UNSET
    system_prompt: Union[Unset, str] = UNSET
    permission_mode: Union[Unset, PostApiSessionsBodyPermissionMode] = UNSET
    allowed_tools: Union[Unset, list[str]] = UNSET
    disallowed_tools: Union[Unset, list[str]] = UNSET
    betas: Union[Unset, list[str]] = UNSET
    subagents: Union[Unset, "PostApiSessionsBodySubagents"] = UNSET
    initial_agent: Union[Unset, str] = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        agent = self.agent

        credential_id = self.credential_id

        extra_env: Union[Unset, dict[str, Any]] = UNSET
        if not isinstance(self.extra_env, Unset):
            extra_env = self.extra_env.to_dict()

        startup_script = self.startup_script

        model = self.model

        mcp_servers: Union[Unset, dict[str, Any]] = UNSET
        if not isinstance(self.mcp_servers, Unset):
            mcp_servers = self.mcp_servers.to_dict()

        system_prompt = self.system_prompt

        permission_mode: Union[Unset, str] = UNSET
        if not isinstance(self.permission_mode, Unset):
            permission_mode = self.permission_mode

        allowed_tools: Union[Unset, list[str]] = UNSET
        if not isinstance(self.allowed_tools, Unset):
            allowed_tools = self.allowed_tools

        disallowed_tools: Union[Unset, list[str]] = UNSET
        if not isinstance(self.disallowed_tools, Unset):
            disallowed_tools = self.disallowed_tools

        betas: Union[Unset, list[str]] = UNSET
        if not isinstance(self.betas, Unset):
            betas = self.betas

        subagents: Union[Unset, dict[str, Any]] = UNSET
        if not isinstance(self.subagents, Unset):
            subagents = self.subagents.to_dict()

        initial_agent = self.initial_agent

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "agent": agent,
            }
        )
        if credential_id is not UNSET:
            field_dict["credentialId"] = credential_id
        if extra_env is not UNSET:
            field_dict["extraEnv"] = extra_env
        if startup_script is not UNSET:
            field_dict["startupScript"] = startup_script
        if model is not UNSET:
            field_dict["model"] = model
        if mcp_servers is not UNSET:
            field_dict["mcpServers"] = mcp_servers
        if system_prompt is not UNSET:
            field_dict["systemPrompt"] = system_prompt
        if permission_mode is not UNSET:
            field_dict["permissionMode"] = permission_mode
        if allowed_tools is not UNSET:
            field_dict["allowedTools"] = allowed_tools
        if disallowed_tools is not UNSET:
            field_dict["disallowedTools"] = disallowed_tools
        if betas is not UNSET:
            field_dict["betas"] = betas
        if subagents is not UNSET:
            field_dict["subagents"] = subagents
        if initial_agent is not UNSET:
            field_dict["initialAgent"] = initial_agent

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.post_api_sessions_body_extra_env import (
            PostApiSessionsBodyExtraEnv,
        )
        from ..models.post_api_sessions_body_mcp_servers import (
            PostApiSessionsBodyMcpServers,
        )
        from ..models.post_api_sessions_body_subagents import (
            PostApiSessionsBodySubagents,
        )

        d = dict(src_dict)
        agent = d.pop("agent")

        credential_id = d.pop("credentialId", UNSET)

        _extra_env = d.pop("extraEnv", UNSET)
        extra_env: Union[Unset, PostApiSessionsBodyExtraEnv]
        if isinstance(_extra_env, Unset):
            extra_env = UNSET
        else:
            extra_env = PostApiSessionsBodyExtraEnv.from_dict(_extra_env)

        startup_script = d.pop("startupScript", UNSET)

        model = d.pop("model", UNSET)

        _mcp_servers = d.pop("mcpServers", UNSET)
        mcp_servers: Union[Unset, PostApiSessionsBodyMcpServers]
        if isinstance(_mcp_servers, Unset):
            mcp_servers = UNSET
        else:
            mcp_servers = PostApiSessionsBodyMcpServers.from_dict(_mcp_servers)

        system_prompt = d.pop("systemPrompt", UNSET)

        _permission_mode = d.pop("permissionMode", UNSET)
        permission_mode: Union[Unset, PostApiSessionsBodyPermissionMode]
        if isinstance(_permission_mode, Unset):
            permission_mode = UNSET
        else:
            permission_mode = check_post_api_sessions_body_permission_mode(_permission_mode)

        allowed_tools = cast(list[str], d.pop("allowedTools", UNSET))

        disallowed_tools = cast(list[str], d.pop("disallowedTools", UNSET))

        betas = cast(list[str], d.pop("betas", UNSET))

        _subagents = d.pop("subagents", UNSET)
        subagents: Union[Unset, PostApiSessionsBodySubagents]
        if isinstance(_subagents, Unset):
            subagents = UNSET
        else:
            subagents = PostApiSessionsBodySubagents.from_dict(_subagents)

        initial_agent = d.pop("initialAgent", UNSET)

        post_api_sessions_body = cls(
            agent=agent,
            credential_id=credential_id,
            extra_env=extra_env,
            startup_script=startup_script,
            model=model,
            mcp_servers=mcp_servers,
            system_prompt=system_prompt,
            permission_mode=permission_mode,
            allowed_tools=allowed_tools,
            disallowed_tools=disallowed_tools,
            betas=betas,
            subagents=subagents,
            initial_agent=initial_agent,
        )

        post_api_sessions_body.additional_properties = d
        return post_api_sessions_body

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
