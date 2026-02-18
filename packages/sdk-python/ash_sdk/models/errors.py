from __future__ import annotations


class ApiError(Exception):
    """Error returned by the Ash API."""

    def __init__(self, error: str, status_code: int) -> None:
        super().__init__(error)
        self.error = error
        self.status_code = status_code

    @classmethod
    def from_dict(cls, data: dict) -> ApiError:
        return cls(error=data.get("error", "Unknown error"), status_code=data.get("statusCode", 0))

    def __repr__(self) -> str:
        return f"ApiError(status_code={self.status_code}, error={self.error!r})"
