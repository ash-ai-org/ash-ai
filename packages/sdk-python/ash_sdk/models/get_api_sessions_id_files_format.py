from typing import Literal, cast

GetApiSessionsIdFilesFormat = Literal["json", "raw"]

GET_API_SESSIONS_ID_FILES_FORMAT_VALUES: set[GetApiSessionsIdFilesFormat] = {
    "json",
    "raw",
}


def check_get_api_sessions_id_files_format(value: str) -> GetApiSessionsIdFilesFormat:
    if value in GET_API_SESSIONS_ID_FILES_FORMAT_VALUES:
        return cast(GetApiSessionsIdFilesFormat, value)
    raise TypeError(f"Unexpected value {value!r}. Expected one of {GET_API_SESSIONS_ID_FILES_FORMAT_VALUES!r}")
