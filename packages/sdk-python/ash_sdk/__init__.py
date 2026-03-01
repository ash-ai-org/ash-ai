"""A client library for accessing Ash API"""

from .client import AuthenticatedClient, Client

__all__ = (
    "AuthenticatedClient",
    "Client",
)

# Hand-written high-level client (preserved across regeneration)
from .ash_client import AshClient

__all__ += ("AshClient",)  # type: ignore[assignment]
