"""
Sample Python file for testing modern Python 3.10+ features.
This file covers:
- Match statements (Python 3.10+)
- Structural pattern matching
- Walrus operator (:=)
- Positional-only parameters
- Keyword-only parameters
- Generic syntax (Python 3.12+)
- Type parameter defaults (Python 3.13+)
- Dataclasses
- Protocol classes
- TypedDict
- ParamSpec and TypeVarTuple
- Overloaded functions
- Final and Literal types
- Self type annotation
- Slots
"""

from dataclasses import dataclass, field
from typing import (
    Callable,
    Concatenate,
    Final,
    Generic,
    Literal,
    ParamSpec,
    Protocol,
    Self,
    TypedDict,
    TypeVar,
    TypeVarTuple,
    Unpack,
    overload,
    runtime_checkable,
)

# ============================================================================
# WALRUS OPERATOR (:=)
# ============================================================================


def process_with_walrus(data: list[int]) -> list[int]:
    """Demonstrates walrus operator usage."""
    result = []

    # Walrus operator in while loop
    while (n := len(data)) > 0:
        item = data.pop()
        if (doubled := item * 2) > 10:
            result.append(doubled)

    # Walrus operator in list comprehension
    filtered = [y for x in range(10) if (y := x**2) > 20]

    # Walrus operator in if statement
    if (match := some_regex_match(data)) is not None:
        return match.groups()

    return result


def some_regex_match(data):
    """Dummy function for walrus operator example."""
    return None


# ============================================================================
# MATCH STATEMENTS (Python 3.10+)
# ============================================================================


def handle_command(command: str) -> str:
    """Basic match statement."""
    match command.split():
        case ["quit"]:
            return "Quitting..."
        case ["hello", name]:
            return f"Hello, {name}!"
        case ["add", *numbers]:
            return str(sum(int(n) for n in numbers))
        case _:
            return "Unknown command"


def process_point(point: tuple) -> str:
    """Match with tuple patterns."""
    match point:
        case (0, 0):
            return "Origin"
        case (0, y):
            return f"On Y-axis at {y}"
        case (x, 0):
            return f"On X-axis at {x}"
        case (x, y):
            return f"Point at ({x}, {y})"
        case _:
            return "Not a point"


@dataclass
class Point3D:
    x: float
    y: float
    z: float


def classify_point_3d(point: Point3D) -> str:
    """Match with class patterns."""
    match point:
        case Point3D(x=0, y=0, z=0):
            return "Origin"
        case Point3D(x=0, y=0, z=z):
            return f"On Z-axis at {z}"
        case Point3D(x=x, y=y, z=0):
            return f"On XY-plane at ({x}, {y})"
        case Point3D() as p if p.x == p.y == p.z:
            return f"On diagonal at {p.x}"
        case _:
            return "General point"


def match_with_guards(value: int) -> str:
    """Match with guard conditions."""
    match value:
        case n if n < 0:
            return "Negative"
        case 0:
            return "Zero"
        case n if n < 10:
            return "Small positive"
        case n if n < 100:
            return "Medium positive"
        case _:
            return "Large positive"


def match_with_or_patterns(status: str | int) -> str:
    """Match with OR patterns."""
    match status:
        case "active" | "enabled" | 1:
            return "Active"
        case "inactive" | "disabled" | 0:
            return "Inactive"
        case "pending" | 2:
            return "Pending"
        case _:
            return "Unknown"


def match_with_as_pattern(data: dict) -> str:
    """Match with AS pattern for binding."""
    match data:
        case {"type": "user", "name": str() as name, "age": int() as age}:
            return f"User {name}, age {age}"
        case {"type": "admin", **rest} as admin_data:
            return f"Admin with data: {rest}"
        case _:
            return "Unknown data"


# ============================================================================
# POSITIONAL-ONLY AND KEYWORD-ONLY PARAMETERS
# ============================================================================


def positional_only_example(x: int, y: int, /, z: int = 0) -> int:
    """x and y are positional-only parameters."""
    return x + y + z


def keyword_only_example(*, name: str, age: int) -> str:
    """name and age are keyword-only parameters."""
    return f"{name} is {age} years old"


def mixed_parameters(
    pos_only1: int,
    pos_only2: int,
    /,
    pos_or_kw: int,
    *,
    kw_only1: str,
    kw_only2: str = "default",
) -> dict:
    """Mix of positional-only, positional-or-keyword, and keyword-only."""
    return {
        "pos_only": (pos_only1, pos_only2),
        "pos_or_kw": pos_or_kw,
        "kw_only": (kw_only1, kw_only2),
    }


# ============================================================================
# DATACLASSES
# ============================================================================


@dataclass
class BasicDataclass:
    """Simple dataclass with basic fields."""

    name: str
    age: int
    email: str = ""


@dataclass(frozen=True)
class ImmutableDataclass:
    """Immutable (frozen) dataclass."""

    id: int
    value: str


@dataclass(slots=True)
class SlottedDataclass:
    """Dataclass using __slots__ for memory efficiency."""

    x: float
    y: float
    z: float = 0.0


@dataclass(kw_only=True)
class KeywordOnlyDataclass:
    """Dataclass with keyword-only fields."""

    name: str
    value: int
    optional: str = "default"


@dataclass
class DataclassWithFactory:
    """Dataclass with field factory defaults."""

    name: str
    items: list[str] = field(default_factory=list)
    metadata: dict[str, str] = field(default_factory=dict)
    created_at: float = field(default_factory=lambda: __import__("time").time())


@dataclass
class DataclassWithPostInit:
    """Dataclass with post-init processing."""

    first_name: str
    last_name: str
    full_name: str = field(init=False)

    def __post_init__(self):
        self.full_name = f"{self.first_name} {self.last_name}"


# ============================================================================
# PROTOCOL CLASSES
# ============================================================================


class Drawable(Protocol):
    """Protocol for drawable objects."""

    def draw(self) -> None:
        """Draw the object."""
        ...


class Resizable(Protocol):
    """Protocol for resizable objects."""

    def resize(self, width: int, height: int) -> None:
        """Resize the object."""
        ...


@runtime_checkable
class Serializable(Protocol):
    """Runtime-checkable protocol for serializable objects."""

    def to_json(self) -> str:
        """Serialize to JSON string."""
        ...

    def from_json(self, data: str) -> Self:
        """Deserialize from JSON string."""
        ...


class SupportsComparison(Protocol):
    """Protocol with comparison methods."""

    def __lt__(self, other: Self) -> bool: ...

    def __le__(self, other: Self) -> bool: ...

    def __gt__(self, other: Self) -> bool: ...

    def __ge__(self, other: Self) -> bool: ...


# ============================================================================
# TYPEDDICT
# ============================================================================


class UserDict(TypedDict):
    """TypedDict for user data."""

    name: str
    age: int
    email: str


class PartialUserDict(TypedDict, total=False):
    """TypedDict with all optional keys."""

    name: str
    age: int
    email: str


class UserWithOptional(TypedDict):
    """TypedDict with mixed required and optional keys."""

    id: int
    name: str
    email: str
    # Optional fields require NotRequired from typing_extensions
    # phone: NotRequired[str]


class NestedTypedDict(TypedDict):
    """TypedDict with nested structure."""

    user: UserDict
    permissions: list[str]
    metadata: dict[str, str]


# ============================================================================
# PARAMSPEC AND TYPEVARTUPLE
# ============================================================================

P = ParamSpec("P")
Ts = TypeVarTuple("Ts")
T = TypeVar("T")
R = TypeVar("R")


def with_logging(func: Callable[P, R]) -> Callable[P, R]:
    """Decorator using ParamSpec to preserve function signature."""

    def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        print(f"Calling {func.__name__}")
        result = func(*args, **kwargs)
        print(f"{func.__name__} returned {result}")
        return result

    return wrapper


def add_first_arg(func: Callable[Concatenate[int, P], R]) -> Callable[P, R]:
    """Decorator that adds first argument using Concatenate."""

    def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        return func(0, *args, **kwargs)

    return wrapper


class GenericTuple(Generic[Unpack[Ts]]):
    """Generic class with variadic type parameters."""

    def __init__(self, *args: Unpack[Ts]) -> None:
        self.items = args

    def get_first(self) -> Ts[0]:
        return self.items[0]


def process_args(*args: Unpack[Ts]) -> tuple[Unpack[Ts]]:
    """Function with variadic type parameters."""
    return args


# ============================================================================
# OVERLOADED FUNCTIONS
# ============================================================================


@overload
def process_value(value: int) -> str: ...


@overload
def process_value(value: str) -> int: ...


@overload
def process_value(value: list[int]) -> list[str]: ...


def process_value(value: int | str | list[int]) -> str | int | list[str]:
    """Overloaded function implementation."""
    if isinstance(value, int):
        return str(value)
    elif isinstance(value, str):
        return len(value)
    else:
        return [str(x) for x in value]


@overload
def fetch_data(url: str, *, as_json: Literal[True]) -> dict: ...


@overload
def fetch_data(url: str, *, as_json: Literal[False]) -> str: ...


def fetch_data(url: str, *, as_json: bool = False) -> dict | str:
    """Overloaded function with literal type discrimination."""
    if as_json:
        return {"url": url}
    return url


# ============================================================================
# FINAL AND LITERAL TYPES
# ============================================================================


# Final variable - cannot be reassigned
MAX_SIZE: Final[int] = 100
API_VERSION: Final = "v2"


class ConfigClass:
    """Class with Final class variable."""

    DEFAULT_TIMEOUT: Final[int] = 30

    def __init__(self):
        self.timeout: Final = ConfigClass.DEFAULT_TIMEOUT


# Literal type for restricted values
Mode = Literal["read", "write", "append"]
LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]


def open_file(path: str, mode: Mode) -> str:
    """Function with Literal type parameter."""
    return f"Opening {path} in {mode} mode"


def set_log_level(level: LogLevel) -> None:
    """Function with Literal union type."""
    print(f"Log level set to {level}")


# Combined Literal types
HttpMethod = Literal["GET", "POST", "PUT", "DELETE", "PATCH"]
StatusCode = Literal[200, 201, 204, 400, 401, 403, 404, 500]


def make_request(method: HttpMethod, url: str) -> StatusCode:
    """Function returning Literal type."""
    return 200


# ============================================================================
# SELF TYPE ANNOTATION
# ============================================================================


class ChainableBuilder:
    """Class using Self type for method chaining."""

    def __init__(self):
        self.items: list[str] = []

    def add(self, item: str) -> Self:
        """Add item and return self for chaining."""
        self.items.append(item)
        return self

    def clear(self) -> Self:
        """Clear items and return self for chaining."""
        self.items.clear()
        return self

    @classmethod
    def create(cls) -> Self:
        """Factory method returning Self."""
        return cls()

    def clone(self) -> Self:
        """Create a copy of this builder."""
        new = type(self)()
        new.items = self.items.copy()
        return new


class DerivedBuilder(ChainableBuilder):
    """Derived class inherits Self-typed methods correctly."""

    def add_prefix(self, prefix: str) -> Self:
        """Add prefix to all items."""
        self.items = [f"{prefix}{item}" for item in self.items]
        return self


# ============================================================================
# __SLOTS__
# ============================================================================


class SlottedClass:
    """Class using __slots__ for memory efficiency."""

    __slots__ = ("x", "y", "z")

    def __init__(self, x: float, y: float, z: float = 0.0):
        self.x = x
        self.y = y
        self.z = z

    def magnitude(self) -> float:
        return (self.x**2 + self.y**2 + self.z**2) ** 0.5


class SlottedWithDict:
    """Slotted class that also allows __dict__."""

    __slots__ = ("x", "y", "__dict__")

    def __init__(self, x: int, y: int):
        self.x = x
        self.y = y

    def set_dynamic(self, key: str, value: object) -> None:
        setattr(self, key, value)


class InheritedSlots(SlottedClass):
    """Class inheriting from slotted class with additional slots."""

    __slots__ = ("w",)

    def __init__(self, x: float, y: float, z: float, w: float):
        super().__init__(x, y, z)
        self.w = w


# ============================================================================
# GENERIC SYNTAX (Python 3.12+)
# ============================================================================

# Note: This syntax requires Python 3.12+
# Using the new generic syntax without explicit TypeVar


# def first[T](items: list[T]) -> T:
#     """Generic function using Python 3.12+ syntax."""
#     return items[0]


# class Stack[T]:
#     """Generic class using Python 3.12+ syntax."""
#
#     def __init__(self) -> None:
#         self._items: list[T] = []
#
#     def push(self, item: T) -> None:
#         self._items.append(item)
#
#     def pop(self) -> T:
#         return self._items.pop()


# type Point = tuple[float, float]  # Type alias using 'type' statement


# Fallback to traditional syntax for compatibility
T_co = TypeVar("T_co", covariant=True)
T_contra = TypeVar("T_contra", contravariant=True)


class Producer(Generic[T_co]):
    """Generic class with covariant type parameter."""

    def produce(self) -> T_co:
        raise NotImplementedError


class Consumer(Generic[T_contra]):
    """Generic class with contravariant type parameter."""

    def consume(self, value: T_contra) -> None:
        raise NotImplementedError


# ============================================================================
# ASYNC GENERATORS AND CONTEXT MANAGERS
# ============================================================================


async def async_range(start: int, stop: int):
    """Async generator function."""
    for i in range(start, stop):
        yield i


class AsyncContextManager:
    """Async context manager implementation."""

    async def __aenter__(self) -> Self:
        print("Entering async context")
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> bool:
        print("Exiting async context")
        return False

    async def do_work(self) -> str:
        return "Work done"


# ============================================================================
# EXCEPTION GROUPS (Python 3.11+)
# ============================================================================


def handle_exception_group():
    """Example of exception group handling."""
    try:
        raise ExceptionGroup(
            "multiple errors",
            [ValueError("value error"), TypeError("type error")],
        )
    except* ValueError as e:
        print(f"Caught ValueError: {e}")
    except* TypeError as e:
        print(f"Caught TypeError: {e}")


# ============================================================================
# CLASS WITH ALL MODERN FEATURES COMBINED
# ============================================================================


@dataclass(slots=True, frozen=False, kw_only=True)
class ModernEntity:
    """Dataclass combining many modern Python features."""

    id: int
    name: str
    status: Literal["active", "inactive", "pending"] = "pending"
    tags: list[str] = field(default_factory=list)
    metadata: dict[str, str] = field(default_factory=dict)

    def activate(self) -> Self:
        """Set status to active."""
        object.__setattr__(self, "status", "active")
        return self

    @classmethod
    def create(cls, id: int, name: str, /) -> Self:
        """Factory with positional-only parameters."""
        return cls(id=id, name=name)


# Type for the module-level function
ProcessFunc = Callable[[ModernEntity], str]


def process_entity(entity: ModernEntity) -> str:
    """Process a modern entity."""
    match entity.status:
        case "active":
            return f"Processing active entity: {entity.name}"
        case "inactive":
            return f"Skipping inactive entity: {entity.name}"
        case "pending":
            return f"Queuing pending entity: {entity.name}"
