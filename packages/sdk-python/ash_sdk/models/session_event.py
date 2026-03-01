import datetime
from collections.abc import Mapping
from typing import (
    Any,
    TypeVar,
    Union,
    cast,
)
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

from ..models.session_event_type import SessionEventType, check_session_event_type
from ..types import UNSET, Unset

T = TypeVar("T", bound="SessionEvent")


@_attrs_define
class SessionEvent:
    """
    Attributes:
        id (UUID):
        session_id (UUID):
        type_ (SessionEventType):
        sequence (int):
        created_at (datetime.datetime):
        tenant_id (Union[Unset, str]):
        data (Union[None, Unset, str]): JSON-encoded event payload
    """

    id: UUID
    session_id: UUID
    type_: SessionEventType
    sequence: int
    created_at: datetime.datetime
    tenant_id: Union[Unset, str] = UNSET
    data: Union[None, Unset, str] = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        id = str(self.id)

        session_id = str(self.session_id)

        type_: str = self.type_

        sequence = self.sequence

        created_at = self.created_at.isoformat()

        tenant_id = self.tenant_id

        data: Union[None, Unset, str]
        if isinstance(self.data, Unset):
            data = UNSET
        else:
            data = self.data

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "id": id,
                "sessionId": session_id,
                "type": type_,
                "sequence": sequence,
                "createdAt": created_at,
            }
        )
        if tenant_id is not UNSET:
            field_dict["tenantId"] = tenant_id
        if data is not UNSET:
            field_dict["data"] = data

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        id = UUID(d.pop("id"))

        session_id = UUID(d.pop("sessionId"))

        type_ = check_session_event_type(d.pop("type"))

        sequence = d.pop("sequence")

        created_at = isoparse(d.pop("createdAt"))

        tenant_id = d.pop("tenantId", UNSET)

        def _parse_data(data: object) -> Union[None, Unset, str]:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(Union[None, Unset, str], data)

        data = _parse_data(d.pop("data", UNSET))

        session_event = cls(
            id=id,
            session_id=session_id,
            type_=type_,
            sequence=sequence,
            created_at=created_at,
            tenant_id=tenant_id,
            data=data,
        )

        session_event.additional_properties = d
        return session_event

    @property
    def additional_keys(self) -> list[str]:
        return list(self.additional_properties.keys())

    def __getitem__(self, key: str) -> Any:
        return self.additional_properties[key]

    def __setitem__(self, key: str, value: Any) -> None:
        self.additional_properties[key] = value

    def __delitem__(self, key: str) -> None:
        del self.additional_properties[key]

    def __contains__(self, key: str) -> bool:
        return key in self.additional_properties
