"""
Sample Python file with various function patterns
"""

import asyncio
from typing import Callable, Generator, List, TypeVar

T = TypeVar("T")


# Simple function
def add(a: int, b: int) -> int:
    """Add two numbers."""
    return a + b


# Async function
async def fetch_data(url: str) -> str:
    """Fetch data from a URL (simulated)."""
    await asyncio.sleep(0.1)
    return f"Data from {url}"


# Generator function
def range_gen(start: int, end: int) -> Generator[int, None, None]:
    """Generate a range of numbers."""
    for i in range(start, end):
        yield i


# Async generator
async def async_range(start: int, end: int):
    """Async generator for a range."""
    for i in range(start, end):
        await asyncio.sleep(0)
        yield i


# Lambda stored in variable (becomes a variable node, not function)
multiply = lambda a, b: a * b


# Function with complex logic
def divide(a: float, b: float) -> float:
    """Divide two numbers with zero check."""
    if b == 0:
        raise ValueError("Division by zero")
    return a / b


# Higher-order function
def create_multiplier(factor: int) -> Callable[[int], int]:
    """Create a multiplier function."""

    def multiplier(value: int) -> int:
        return value * factor

    return multiplier


# Function with nested function
def outer_function(x: int) -> int:
    """Outer function with nested inner function."""

    def inner_function(y: int) -> int:
        """Inner function that doubles the value."""
        return y * 2

    return inner_function(x) + x


# Function with callback parameter
def process_items(items: List[T], callback: Callable[[T, int], None]) -> None:
    """Process items with a callback."""
    for index, item in enumerate(items):
        callback(item, index)


# Decorated function
def log_calls(func: Callable) -> Callable:
    """Decorator to log function calls."""

    def wrapper(*args, **kwargs):
        print(f"Calling {func.__name__}")
        return func(*args, **kwargs)

    return wrapper


@log_calls
def decorated_function(x: int) -> int:
    """A decorated function."""
    return x * 2


# Multiple decorators
def validate_input(func: Callable) -> Callable:
    """Decorator to validate input."""

    def wrapper(*args, **kwargs):
        return func(*args, **kwargs)

    return wrapper


@log_calls
@validate_input
def multi_decorated(value: str) -> str:
    """Function with multiple decorators."""
    return value.upper()


# Function with default parameters
def greet(name: str, greeting: str = "Hello") -> str:
    """Greet someone with optional greeting."""
    return f"{greeting}, {name}!"


# Function with *args and **kwargs
def flexible_function(*args, **kwargs) -> dict:
    """Function with flexible arguments."""
    return {"args": args, "kwargs": kwargs}


# Recursive function
def factorial(n: int) -> int:
    """Calculate factorial recursively."""
    if n <= 1:
        return 1
    return n * factorial(n - 1)


# Module-level constants
PI = 3.14159
E = 2.71828
