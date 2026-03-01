from collections.abc import Mapping
from typing import (
    TYPE_CHECKING,
    Any,
    TypeVar,
    Union,
)

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.post_api_sessions_id_messages_body_effort import (
    PostApiSessionsIdMessagesBodyEffort,
    check_post_api_sessions_id_messages_body_effort,
)
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.post_api_sessions_id_messages_body_output_format import (
        PostApiSessionsIdMessagesBodyOutputFormat,
    )
    from ..models.post_api_sessions_id_messages_body_thinking import (
        PostApiSessionsIdMessagesBodyThinking,
    )


T = TypeVar("T", bound="PostApiSessionsIdMessagesBody")


@_attrs_define
class PostApiSessionsIdMessagesBody:
    """
    Attributes:
        content (str):
        include_partial_messages (Union[Unset, bool]):
        model (Union[Unset, str]): Model override for this query. Overrides session and agent defaults.
        max_turns (Union[Unset, int]): Maximum agentic turns for this query.
        max_budget_usd (Union[Unset, float]): Maximum budget in USD for this query.
        effort (Union[Unset, PostApiSessionsIdMessagesBodyEffort]): Effort level for this query.
        thinking (Union[Unset, PostApiSessionsIdMessagesBodyThinking]): Thinking configuration for this query.
        output_format (Union[Unset, PostApiSessionsIdMessagesBodyOutputFormat]): Output format constraint for this
            query.
    """

    content: str
    include_partial_messages: Union[Unset, bool] = UNSET
    model: Union[Unset, str] = UNSET
    max_turns: Union[Unset, int] = UNSET
    max_budget_usd: Union[Unset, float] = UNSET
    effort: Union[Unset, PostApiSessionsIdMessagesBodyEffort] = UNSET
    thinking: Union[Unset, "PostApiSessionsIdMessagesBodyThinking"] = UNSET
    output_format: Union[Unset, "PostApiSessionsIdMessagesBodyOutputFormat"] = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        content = self.content

        include_partial_messages = self.include_partial_messages

        model = self.model

        max_turns = self.max_turns

        max_budget_usd = self.max_budget_usd

        effort: Union[Unset, str] = UNSET
        if not isinstance(self.effort, Unset):
            effort = self.effort

        thinking: Union[Unset, dict[str, Any]] = UNSET
        if not isinstance(self.thinking, Unset):
            thinking = self.thinking.to_dict()

        output_format: Union[Unset, dict[str, Any]] = UNSET
        if not isinstance(self.output_format, Unset):
            output_format = self.output_format.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "content": content,
            }
        )
        if include_partial_messages is not UNSET:
            field_dict["includePartialMessages"] = include_partial_messages
        if model is not UNSET:
            field_dict["model"] = model
        if max_turns is not UNSET:
            field_dict["maxTurns"] = max_turns
        if max_budget_usd is not UNSET:
            field_dict["maxBudgetUsd"] = max_budget_usd
        if effort is not UNSET:
            field_dict["effort"] = effort
        if thinking is not UNSET:
            field_dict["thinking"] = thinking
        if output_format is not UNSET:
            field_dict["outputFormat"] = output_format

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.post_api_sessions_id_messages_body_output_format import (
            PostApiSessionsIdMessagesBodyOutputFormat,
        )
        from ..models.post_api_sessions_id_messages_body_thinking import (
            PostApiSessionsIdMessagesBodyThinking,
        )

        d = dict(src_dict)
        content = d.pop("content")

        include_partial_messages = d.pop("includePartialMessages", UNSET)

        model = d.pop("model", UNSET)

        max_turns = d.pop("maxTurns", UNSET)

        max_budget_usd = d.pop("maxBudgetUsd", UNSET)

        _effort = d.pop("effort", UNSET)
        effort: Union[Unset, PostApiSessionsIdMessagesBodyEffort]
        if isinstance(_effort, Unset):
            effort = UNSET
        else:
            effort = check_post_api_sessions_id_messages_body_effort(_effort)

        _thinking = d.pop("thinking", UNSET)
        thinking: Union[Unset, PostApiSessionsIdMessagesBodyThinking]
        if isinstance(_thinking, Unset):
            thinking = UNSET
        else:
            thinking = PostApiSessionsIdMessagesBodyThinking.from_dict(_thinking)

        _output_format = d.pop("outputFormat", UNSET)
        output_format: Union[Unset, PostApiSessionsIdMessagesBodyOutputFormat]
        if isinstance(_output_format, Unset):
            output_format = UNSET
        else:
            output_format = PostApiSessionsIdMessagesBodyOutputFormat.from_dict(_output_format)

        post_api_sessions_id_messages_body = cls(
            content=content,
            include_partial_messages=include_partial_messages,
            model=model,
            max_turns=max_turns,
            max_budget_usd=max_budget_usd,
            effort=effort,
            thinking=thinking,
            output_format=output_format,
        )

        post_api_sessions_id_messages_body.additional_properties = d
        return post_api_sessions_id_messages_body

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
