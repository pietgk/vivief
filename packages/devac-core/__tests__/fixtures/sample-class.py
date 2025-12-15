"""
Sample Python file for testing the parser
Contains various constructs: class, methods, properties, imports
"""

from abc import ABC, abstractmethod
from enum import Enum
from typing import Dict, List, Optional

# Type alias
UserId = str


# Enum
class Status(Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    PENDING = "pending"


# Abstract class
class BaseService(ABC):
    """Base service class with abstract method."""

    def __init__(self, name: str) -> None:
        self._name = name

    @property
    def name(self) -> str:
        """Get the service name."""
        return self._name

    @abstractmethod
    async def process(self) -> None:
        """Process method to be implemented by subclasses."""
        pass


# Concrete class extending abstract
class UserService(BaseService):
    """User service implementation."""

    VERSION = "1.0.0"  # Class constant

    def __init__(self) -> None:
        super().__init__("UserService")
        self._users: Dict[UserId, dict] = {}

    async def process(self) -> None:
        """Process users."""
        print("Processing users...")

    def get_user(self, user_id: UserId) -> Optional[dict]:
        """Get a user by ID."""
        return self._users.get(user_id)

    def add_user(self, user_id: UserId, config: dict) -> None:
        """Add a user."""
        self._users[user_id] = config

    @staticmethod
    def create_default() -> "UserService":
        """Create a default UserService instance."""
        return UserService()

    @classmethod
    def from_config(cls, config: dict) -> "UserService":
        """Create a UserService from config."""
        service = cls()
        return service

    @property
    def user_count(self) -> int:
        """Get the number of users."""
        return len(self._users)

    def for_each(self, callback) -> None:
        """Iterate over users with a callback."""
        for user_id, user in self._users.items():
            callback(user, user_id)


# Multiple inheritance
class LoggingMixin:
    """Mixin for logging functionality."""

    def log(self, message: str) -> None:
        """Log a message."""
        print(f"[LOG] {message}")


class AuditableService(UserService, LoggingMixin):
    """Service with auditing capabilities."""

    def audit_action(self, action: str) -> None:
        """Audit an action."""
        self.log(f"Audit: {action}")


# Standalone functions
def create_user(name: str, email: str) -> dict:
    """Create a user configuration dict."""
    return {"name": name, "email": email}


def validate_user(user: dict) -> bool:
    """Validate a user configuration."""
    return bool(user.get("name")) and "@" in user.get("email", "")


# Module-level variable
default_service: Optional[UserService] = None

# Module-level constant
MAX_USERS = 1000
