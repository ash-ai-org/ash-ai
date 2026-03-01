from http import HTTPStatus
from typing import Any
from urllib.parse import quote
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.api_error import ApiError
from ...models.get_api_sessions_id_events_response_200 import (
    GetApiSessionsIdEventsResponse200,
)
from ...types import UNSET, Response, Unset


def _get_kwargs(
    id: UUID,
    *,
    limit: int | Unset = 200,
    after: int | Unset = 0,
    type_: str | Unset = UNSET,
) -> dict[str, Any]:
    params: dict[str, Any] = {}

    params["limit"] = limit

    params["after"] = after

    params["type"] = type_

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/api/sessions/{id}/events".format(
            id=quote(str(id), safe=""),
        ),
        "params": params,
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> ApiError | GetApiSessionsIdEventsResponse200 | None:
    if response.status_code == 200:
        response_200 = GetApiSessionsIdEventsResponse200.from_dict(response.json())

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
) -> Response[ApiError | GetApiSessionsIdEventsResponse200]:
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
    limit: int | Unset = 200,
    after: int | Unset = 0,
    type_: str | Unset = UNSET,
) -> Response[ApiError | GetApiSessionsIdEventsResponse200]:
    """
    Args:
        id (UUID):
        limit (int | Unset):  Default: 200.
        after (int | Unset):  Default: 0.
        type_ (str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ApiError | GetApiSessionsIdEventsResponse200]
    """

    kwargs = _get_kwargs(
        id=id,
        limit=limit,
        after=after,
        type_=type_,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    id: UUID,
    *,
    client: AuthenticatedClient | Client,
    limit: int | Unset = 200,
    after: int | Unset = 0,
    type_: str | Unset = UNSET,
) -> ApiError | GetApiSessionsIdEventsResponse200 | None:
    """
    Args:
        id (UUID):
        limit (int | Unset):  Default: 200.
        after (int | Unset):  Default: 0.
        type_ (str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ApiError | GetApiSessionsIdEventsResponse200
    """

    return sync_detailed(
        id=id,
        client=client,
        limit=limit,
        after=after,
        type_=type_,
    ).parsed


async def asyncio_detailed(
    id: UUID,
    *,
    client: AuthenticatedClient | Client,
    limit: int | Unset = 200,
    after: int | Unset = 0,
    type_: str | Unset = UNSET,
) -> Response[ApiError | GetApiSessionsIdEventsResponse200]:
    """
    Args:
        id (UUID):
        limit (int | Unset):  Default: 200.
        after (int | Unset):  Default: 0.
        type_ (str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ApiError | GetApiSessionsIdEventsResponse200]
    """

    kwargs = _get_kwargs(
        id=id,
        limit=limit,
        after=after,
        type_=type_,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    id: UUID,
    *,
    client: AuthenticatedClient | Client,
    limit: int | Unset = 200,
    after: int | Unset = 0,
    type_: str | Unset = UNSET,
) -> ApiError | GetApiSessionsIdEventsResponse200 | None:
    """
    Args:
        id (UUID):
        limit (int | Unset):  Default: 200.
        after (int | Unset):  Default: 0.
        type_ (str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ApiError | GetApiSessionsIdEventsResponse200
    """

    return (
        await asyncio_detailed(
            id=id,
            client=client,
            limit=limit,
            after=after,
            type_=type_,
        )
    ).parsed
