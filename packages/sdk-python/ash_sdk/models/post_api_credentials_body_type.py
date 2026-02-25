from typing import Literal, cast

PostApiCredentialsBodyType = Literal["anthropic", "custom", "openai"]

POST_API_CREDENTIALS_BODY_TYPE_VALUES: set[PostApiCredentialsBodyType] = {
    "anthropic",
    "custom",
    "openai",
}


def check_post_api_credentials_body_type(value: str) -> PostApiCredentialsBodyType:
    if value in POST_API_CREDENTIALS_BODY_TYPE_VALUES:
        return cast(PostApiCredentialsBodyType, value)
    raise TypeError(f"Unexpected value {value!r}. Expected one of {POST_API_CREDENTIALS_BODY_TYPE_VALUES!r}")
