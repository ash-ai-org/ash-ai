from typing import Literal, cast

SessionStatus = Literal["active", "ended", "error", "paused", "starting", "stopped"]

SESSION_STATUS_VALUES: set[SessionStatus] = {
    "active",
    "ended",
    "error",
    "paused",
    "starting",
    "stopped",
}


def check_session_status(value: str) -> SessionStatus:
    if value in SESSION_STATUS_VALUES:
        return cast(SessionStatus, value)
    raise TypeError(f"Unexpected value {value!r}. Expected one of {SESSION_STATUS_VALUES!r}")
