from typing import Literal, cast

MessageRole = Literal["assistant", "user"]

MESSAGE_ROLE_VALUES: set[MessageRole] = {
    "assistant",
    "user",
}


def check_message_role(value: str) -> MessageRole:
    if value in MESSAGE_ROLE_VALUES:
        return cast(MessageRole, value)
    raise TypeError(f"Unexpected value {value!r}. Expected one of {MESSAGE_ROLE_VALUES!r}")
