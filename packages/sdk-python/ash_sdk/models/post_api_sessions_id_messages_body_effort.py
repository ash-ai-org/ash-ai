from typing import Literal, cast

PostApiSessionsIdMessagesBodyEffort = Literal["high", "low", "max", "medium"]

POST_API_SESSIONS_ID_MESSAGES_BODY_EFFORT_VALUES: set[PostApiSessionsIdMessagesBodyEffort] = {
    "high",
    "low",
    "max",
    "medium",
}


def check_post_api_sessions_id_messages_body_effort(
    value: str,
) -> PostApiSessionsIdMessagesBodyEffort:
    if value in POST_API_SESSIONS_ID_MESSAGES_BODY_EFFORT_VALUES:
        return cast(PostApiSessionsIdMessagesBodyEffort, value)
    raise TypeError(f"Unexpected value {value!r}. Expected one of {POST_API_SESSIONS_ID_MESSAGES_BODY_EFFORT_VALUES!r}")
