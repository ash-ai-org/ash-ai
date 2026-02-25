from typing import Literal, cast

GetApiQueueStatus = Literal["cancelled", "completed", "failed", "pending", "processing"]

GET_API_QUEUE_STATUS_VALUES: set[GetApiQueueStatus] = {
    "cancelled",
    "completed",
    "failed",
    "pending",
    "processing",
}


def check_get_api_queue_status(value: str) -> GetApiQueueStatus:
    if value in GET_API_QUEUE_STATUS_VALUES:
        return cast(GetApiQueueStatus, value)
    raise TypeError(f"Unexpected value {value!r}. Expected one of {GET_API_QUEUE_STATUS_VALUES!r}")
