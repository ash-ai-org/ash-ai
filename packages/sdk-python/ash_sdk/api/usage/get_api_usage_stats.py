import datetime
from http import HTTPStatus
from typing import Any
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.get_api_usage_stats_response_200 import GetApiUsageStatsResponse200
from ...types import UNSET, Response, Unset


def _get_kwargs(
    *,
    session_id: UUID | Unset = UNSET,
    agent_name: str | Unset = UNSET,
    after: datetime.datetime | Unset = UNSET,
    before: datetime.datetime | Unset = UNSET,
) -> dict[str, Any]:
    params: dict[str, Any] = {}

    json_session_id: str | Unset = UNSET
    if not isinstance(session_id, Unset):
        json_session_id = str(session_id)
    params["sessionId"] = json_session_id

    params["agentName"] = agent_name

    json_after: str | Unset = UNSET
    if not isinstance(after, Unset):
        json_after = after.isoformat()
    params["after"] = json_after

    json_before: str | Unset = UNSET
    if not isinstance(before, Unset):
        json_before = before.isoformat()
    params["before"] = json_before

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/api/usage/stats",
        "params": params,
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> GetApiUsageStatsResponse200 | None:
    if response.status_code == 200:
        response_200 = GetApiUsageStatsResponse200.from_dict(response.json())

        return response_200

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> Response[GetApiUsageStatsResponse200]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient | Client,
    session_id: UUID | Unset = UNSET,
    agent_name: str | Unset = UNSET,
    after: datetime.datetime | Unset = UNSET,
    before: datetime.datetime | Unset = UNSET,
) -> Response[GetApiUsageStatsResponse200]:
    """
    Args:
        session_id (UUID | Unset):
        agent_name (str | Unset):
        after (datetime.datetime | Unset):
        before (datetime.datetime | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[GetApiUsageStatsResponse200]
    """

    kwargs = _get_kwargs(
        session_id=session_id,
        agent_name=agent_name,
        after=after,
        before=before,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient | Client,
    session_id: UUID | Unset = UNSET,
    agent_name: str | Unset = UNSET,
    after: datetime.datetime | Unset = UNSET,
    before: datetime.datetime | Unset = UNSET,
) -> GetApiUsageStatsResponse200 | None:
    """
    Args:
        session_id (UUID | Unset):
        agent_name (str | Unset):
        after (datetime.datetime | Unset):
        before (datetime.datetime | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        GetApiUsageStatsResponse200
    """

    return sync_detailed(
        client=client,
        session_id=session_id,
        agent_name=agent_name,
        after=after,
        before=before,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient | Client,
    session_id: UUID | Unset = UNSET,
    agent_name: str | Unset = UNSET,
    after: datetime.datetime | Unset = UNSET,
    before: datetime.datetime | Unset = UNSET,
) -> Response[GetApiUsageStatsResponse200]:
    """
    Args:
        session_id (UUID | Unset):
        agent_name (str | Unset):
        after (datetime.datetime | Unset):
        before (datetime.datetime | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[GetApiUsageStatsResponse200]
    """

    kwargs = _get_kwargs(
        session_id=session_id,
        agent_name=agent_name,
        after=after,
        before=before,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient | Client,
    session_id: UUID | Unset = UNSET,
    agent_name: str | Unset = UNSET,
    after: datetime.datetime | Unset = UNSET,
    before: datetime.datetime | Unset = UNSET,
) -> GetApiUsageStatsResponse200 | None:
    """
    Args:
        session_id (UUID | Unset):
        agent_name (str | Unset):
        after (datetime.datetime | Unset):
        before (datetime.datetime | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        GetApiUsageStatsResponse200
    """

    return (
        await asyncio_detailed(
            client=client,
            session_id=session_id,
            agent_name=agent_name,
            after=after,
            before=before,
        )
    ).parsed
