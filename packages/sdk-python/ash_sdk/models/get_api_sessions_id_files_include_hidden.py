from typing import Literal, cast

GetApiSessionsIdFilesIncludeHidden = Literal["false", "true"]

GET_API_SESSIONS_ID_FILES_INCLUDE_HIDDEN_VALUES: set[GetApiSessionsIdFilesIncludeHidden] = {
    "false",
    "true",
}


def check_get_api_sessions_id_files_include_hidden(
    value: str,
) -> GetApiSessionsIdFilesIncludeHidden:
    if value in GET_API_SESSIONS_ID_FILES_INCLUDE_HIDDEN_VALUES:
        return cast(GetApiSessionsIdFilesIncludeHidden, value)
    raise TypeError(f"Unexpected value {value!r}. Expected one of {GET_API_SESSIONS_ID_FILES_INCLUDE_HIDDEN_VALUES!r}")
