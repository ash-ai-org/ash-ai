from typing import Literal, cast

GetApiSessionsIdFilesResponse200Source = Literal["sandbox", "snapshot"]

GET_API_SESSIONS_ID_FILES_RESPONSE_200_SOURCE_VALUES: set[GetApiSessionsIdFilesResponse200Source] = {
    "sandbox",
    "snapshot",
}


def check_get_api_sessions_id_files_response_200_source(
    value: str,
) -> GetApiSessionsIdFilesResponse200Source:
    if value in GET_API_SESSIONS_ID_FILES_RESPONSE_200_SOURCE_VALUES:
        return cast(GetApiSessionsIdFilesResponse200Source, value)
    raise TypeError(
        f"Unexpected value {value!r}. Expected one of {GET_API_SESSIONS_ID_FILES_RESPONSE_200_SOURCE_VALUES!r}"
    )
