from typing import Literal, cast

PostApiSessionsBodyPermissionMode = Literal["bypassPermissions", "default", "permissionsByAgent"]

POST_API_SESSIONS_BODY_PERMISSION_MODE_VALUES: set[PostApiSessionsBodyPermissionMode] = {
    "bypassPermissions",
    "default",
    "permissionsByAgent",
}


def check_post_api_sessions_body_permission_mode(
    value: str,
) -> PostApiSessionsBodyPermissionMode:
    if value in POST_API_SESSIONS_BODY_PERMISSION_MODE_VALUES:
        return cast(PostApiSessionsBodyPermissionMode, value)
    raise TypeError(f"Unexpected value {value!r}. Expected one of {POST_API_SESSIONS_BODY_PERMISSION_MODE_VALUES!r}")
