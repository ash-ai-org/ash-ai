from http import HTTPStatus
from typing import Any
from urllib.parse import quote
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.api_error import ApiError
from ...models.get_api_sessions_id_logs_response_200 import (
    GetApiSessionsIdLogsResponse200,
)
from ...types import UNSET, Response, Unset


def _get_kwargs(
    id: UUID,
    *,
    after: int | Unset = -1,
) -> dict[str, Any]:
    params: dict[str, Any] = {}

    params["after"] = after

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/api/sessions/{id}/logs".format(
            id=quote(str(id), safe=""),
        ),
        "params": params,
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> ApiError | GetApiSessionsIdLogsResponse200 | None:
    if response.status_code == 200:
        response_200 = GetApiSessionsIdLogsResponse200.from_dict(response.json())

        return response_200

    if response.status_code == 404:
        response_404 = ApiError.from_dict(response.json())

        return response_404

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> Response[ApiError | GetApiSessionsIdLogsResponse200]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    id: UUID,
    *,
    client: AuthenticatedClient | Client,
    after: int | Unset = -1,
) -> Response[ApiError | GetApiSessionsIdLogsResponse200]:
    """
    Args:
        id (UUID):
        after (int | Unset):  Default: -1.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ApiError | GetApiSessionsIdLogsResponse200]
    """

    kwargs = _get_kwargs(
        id=id,
        after=after,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    id: UUID,
    *,
    client: AuthenticatedClient | Client,
    after: int | Unset = -1,
) -> ApiError | GetApiSessionsIdLogsResponse200 | None:
    """
    Args:
        id (UUID):
        after (int | Unset):  Default: -1.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ApiError | GetApiSessionsIdLogsResponse200
    """

    return sync_detailed(
        id=id,
        client=client,
        after=after,
    ).parsed


async def asyncio_detailed(
    id: UUID,
    *,
    client: AuthenticatedClient | Client,
    after: int | Unset = -1,
) -> Response[ApiError | GetApiSessionsIdLogsResponse200]:
    """
    Args:
        id (UUID):
        after (int | Unset):  Default: -1.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ApiError | GetApiSessionsIdLogsResponse200]
    """

    kwargs = _get_kwargs(
        id=id,
        after=after,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    id: UUID,
    *,
    client: AuthenticatedClient | Client,
    after: int | Unset = -1,
) -> ApiError | GetApiSessionsIdLogsResponse200 | None:
    """
    Args:
        id (UUID):
        after (int | Unset):  Default: -1.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ApiError | GetApiSessionsIdLogsResponse200
    """

    return (
        await asyncio_detailed(
            id=id,
            client=client,
            after=after,
        )
    ).parsed
