from typing import Literal, cast

SessionEventType = Literal[
    "error",
    "lifecycle",
    "reasoning",
    "text",
    "tool_result",
    "tool_start",
    "turn_complete",
]

SESSION_EVENT_TYPE_VALUES: set[SessionEventType] = {
    "error",
    "lifecycle",
    "reasoning",
    "text",
    "tool_result",
    "tool_start",
    "turn_complete",
}


def check_session_event_type(value: str) -> SessionEventType:
    if value in SESSION_EVENT_TYPE_VALUES:
        return cast(SessionEventType, value)
    raise TypeError(f"Unexpected value {value!r}. Expected one of {SESSION_EVENT_TYPE_VALUES!r}")
