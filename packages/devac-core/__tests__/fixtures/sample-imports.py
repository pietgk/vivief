"""
Sample Python file with various import patterns
"""

# Standard import
import collections as col

# Import with alias
import json as json_lib
import os
import sys

# Relative import (would work in a package context)
# from . import sibling_module
# from .. import parent_module
# from ..utils import helper
# From import - nested module
from collections.abc import Mapping, Sequence
from enum import Enum as BaseEnum

# Star import (imports all public names)
from os.path import *
from pathlib import Path

# From import with alias
from typing import Callable as CallableType

# From import - single item
# From import - multiple items
from typing import Dict, List, Optional, Tuple, Union

# Import for side effects only (no names imported)
# import logging.config


# Type alias using imported types
UserDict = Dict[str, Union[str, int]]
PathOrStr = Union[Path, str]


# Class using imports
class ConfigLoader:
    """Load configuration from various sources."""

    def __init__(self, config_path: PathOrStr) -> None:
        self._path = Path(config_path)
        self._data: Optional[dict] = None

    def load(self) -> dict:
        """Load JSON configuration."""
        with open(self._path) as f:
            self._data = json_lib.load(f)
        return self._data

    def get(self, key: str, default: Optional[str] = None) -> Optional[str]:
        """Get a config value."""
        if self._data is None:
            return default
        return self._data.get(key, default)


# Function using imported types
def get_env_vars() -> Dict[str, str]:
    """Get environment variables."""
    return dict(os.environ)


def read_lines(file_path: PathOrStr) -> List[str]:
    """Read lines from a file."""
    path = Path(file_path)
    return path.read_text().splitlines()


# Using collections
def count_items(items: Sequence[str]) -> dict:
    """Count occurrences of items."""
    counter = col.Counter(items)
    return dict(counter)


# Enum using imported base
class Priority(BaseEnum):
    LOW = 1
    MEDIUM = 2
    HIGH = 3


# Module constants
CURRENT_DIR = os.getcwd()
PYTHON_VERSION = sys.version_info
