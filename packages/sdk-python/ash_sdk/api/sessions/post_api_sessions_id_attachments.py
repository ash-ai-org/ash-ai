from http import HTTPStatus
from typing import Any, Optional, Union
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.api_error import ApiError
from ...models.post_api_sessions_id_attachments_body import (
    PostApiSessionsIdAttachmentsBody,
)
from ...models.post_api_sessions_id_attachments_response_201 import (
    PostApiSessionsIdAttachmentsResponse201,
)
from ...types import Response


def _get_kwargs(
    id: UUID,
    *,
    body: PostApiSessionsIdAttachmentsBody,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/sessions/{id}/attachments".format(
            id=id,
        ),
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Optional[Union[ApiError, PostApiSessionsIdAttachmentsResponse201]]:
    if response.status_code == 201:
        response_201 = PostApiSessionsIdAttachmentsResponse201.from_dict(response.json())

        return response_201

    if response.status_code == 400:
        response_400 = ApiError.from_dict(response.json())

        return response_400

    if response.status_code == 404:
        response_404 = ApiError.from_dict(response.json())

        return response_404

    if response.status_code == 413:
        response_413 = ApiError.from_dict(response.json())

        return response_413

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Response[Union[ApiError, PostApiSessionsIdAttachmentsResponse201]]:
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
    body: PostApiSessionsIdAttachmentsBody,
) -> Response[Union[ApiError, PostApiSessionsIdAttachmentsResponse201]]:
    """
    Args:
        id (UUID):
        body (PostApiSessionsIdAttachmentsBody):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Union[ApiError, PostApiSessionsIdAttachmentsResponse201]]
    """

    kwargs = _get_kwargs(
        id=id,
        body=body,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    id: UUID,
    *,
    client: Union[AuthenticatedClient, Client],
    body: PostApiSessionsIdAttachmentsBody,
) -> Optional[Union[ApiError, PostApiSessionsIdAttachmentsResponse201]]:
    """
    Args:
        id (UUID):
        body (PostApiSessionsIdAttachmentsBody):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Union[ApiError, PostApiSessionsIdAttachmentsResponse201]
    """

    return sync_detailed(
        id=id,
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    id: UUID,
    *,
    client: Union[AuthenticatedClient, Client],
    body: PostApiSessionsIdAttachmentsBody,
) -> Response[Union[ApiError, PostApiSessionsIdAttachmentsResponse201]]:
    """
    Args:
        id (UUID):
        body (PostApiSessionsIdAttachmentsBody):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Union[ApiError, PostApiSessionsIdAttachmentsResponse201]]
    """

    kwargs = _get_kwargs(
        id=id,
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    id: UUID,
    *,
    client: Union[AuthenticatedClient, Client],
    body: PostApiSessionsIdAttachmentsBody,
) -> Optional[Union[ApiError, PostApiSessionsIdAttachmentsResponse201]]:
    """
    Args:
        id (UUID):
        body (PostApiSessionsIdAttachmentsBody):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Union[ApiError, PostApiSessionsIdAttachmentsResponse201]
    """

    return (
        await asyncio_detailed(
            id=id,
            client=client,
            body=body,
        )
    ).parsed
