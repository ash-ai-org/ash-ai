from typing import Literal, cast

GetApiSessionsIdLogsResponse200LogsItemLevel = Literal["stderr", "stdout", "system"]

GET_API_SESSIONS_ID_LOGS_RESPONSE_200_LOGS_ITEM_LEVEL_VALUES: set[GetApiSessionsIdLogsResponse200LogsItemLevel] = {
    "stderr",
    "stdout",
    "system",
}


def check_get_api_sessions_id_logs_response_200_logs_item_level(
    value: str,
) -> GetApiSessionsIdLogsResponse200LogsItemLevel:
    if value in GET_API_SESSIONS_ID_LOGS_RESPONSE_200_LOGS_ITEM_LEVEL_VALUES:
        return cast(GetApiSessionsIdLogsResponse200LogsItemLevel, value)
    raise TypeError(
        f"Unexpected value {value!r}. Expected one of {GET_API_SESSIONS_ID_LOGS_RESPONSE_200_LOGS_ITEM_LEVEL_VALUES!r}"
    )
