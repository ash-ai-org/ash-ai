from typing import Literal, cast

GetApiAgentsNameFilesFormat = Literal["json", "raw"]

GET_API_AGENTS_NAME_FILES_FORMAT_VALUES: set[GetApiAgentsNameFilesFormat] = {
    "json",
    "raw",
}


def check_get_api_agents_name_files_format(value: str) -> GetApiAgentsNameFilesFormat:
    if value in GET_API_AGENTS_NAME_FILES_FORMAT_VALUES:
        return cast(GetApiAgentsNameFilesFormat, value)
    raise TypeError(f"Unexpected value {value!r}. Expected one of {GET_API_AGENTS_NAME_FILES_FORMAT_VALUES!r}")
