from typing import Literal, cast

QueueItemStatus = Literal["cancelled", "completed", "failed", "pending", "processing"]

QUEUE_ITEM_STATUS_VALUES: set[QueueItemStatus] = {
    "cancelled",
    "completed",
    "failed",
    "pending",
    "processing",
}


def check_queue_item_status(value: str) -> QueueItemStatus:
    if value in QUEUE_ITEM_STATUS_VALUES:
        return cast(QueueItemStatus, value)
    raise TypeError(f"Unexpected value {value!r}. Expected one of {QUEUE_ITEM_STATUS_VALUES!r}")
