from typing import Literal, cast

HealthResponseStatus = Literal["ok"]

HEALTH_RESPONSE_STATUS_VALUES: set[HealthResponseStatus] = {
    "ok",
}


def check_health_response_status(value: str) -> HealthResponseStatus:
    if value in HEALTH_RESPONSE_STATUS_VALUES:
        return cast(HealthResponseStatus, value)
    raise TypeError(f"Unexpected value {value!r}. Expected one of {HEALTH_RESPONSE_STATUS_VALUES!r}")
