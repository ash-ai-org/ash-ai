from http import HTTPStatus
from typing import Any, Optional, Union
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
    limit: Union[Unset, int] = 200,
    after: Union[Unset, int] = 0,
    type_: Union[Unset, str] = UNSET,
) -> dict[str, Any]:
    params: dict[str, Any] = {}

    params["limit"] = limit

    params["after"] = after

    params["type"] = type_

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/api/sessions/{id}/events".format(
            id=id,
        ),
        "params": params,
    }

    return _kwargs


def _parse_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Optional[Union[ApiError, GetApiSessionsIdEventsResponse200]]:
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
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Response[Union[ApiError, GetApiSessionsIdEventsResponse200]]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    id: UUID,
    *,
    client: Union[AuthenticatedClient, Client],
    limit: Union[Unset, int] = 200,
    after: Union[Unset, int] = 0,
    type_: Union[Unset, str] = UNSET,
) -> Response[Union[ApiError, GetApiSessionsIdEventsResponse200]]:
    """
    Args:
        id (UUID):
        limit (Union[Unset, int]):  Default: 200.
        after (Union[Unset, int]):  Default: 0.
        type_ (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Union[ApiError, GetApiSessionsIdEventsResponse200]]
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
    client: Union[AuthenticatedClient, Client],
    limit: Union[Unset, int] = 200,
    after: Union[Unset, int] = 0,
    type_: Union[Unset, str] = UNSET,
) -> Optional[Union[ApiError, GetApiSessionsIdEventsResponse200]]:
    """
    Args:
        id (UUID):
        limit (Union[Unset, int]):  Default: 200.
        after (Union[Unset, int]):  Default: 0.
        type_ (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Union[ApiError, GetApiSessionsIdEventsResponse200]
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
    client: Union[AuthenticatedClient, Client],
    limit: Union[Unset, int] = 200,
    after: Union[Unset, int] = 0,
    type_: Union[Unset, str] = UNSET,
) -> Response[Union[ApiError, GetApiSessionsIdEventsResponse200]]:
    """
    Args:
        id (UUID):
        limit (Union[Unset, int]):  Default: 200.
        after (Union[Unset, int]):  Default: 0.
        type_ (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Union[ApiError, GetApiSessionsIdEventsResponse200]]
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
    client: Union[AuthenticatedClient, Client],
    limit: Union[Unset, int] = 200,
    after: Union[Unset, int] = 0,
    type_: Union[Unset, str] = UNSET,
) -> Optional[Union[ApiError, GetApiSessionsIdEventsResponse200]]:
    """
    Args:
        id (UUID):
        limit (Union[Unset, int]):  Default: 200.
        after (Union[Unset, int]):  Default: 0.
        type_ (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Union[ApiError, GetApiSessionsIdEventsResponse200]
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
