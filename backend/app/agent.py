"""Kept for compatibility: the original single agent used by /chat.

The comparison agents live in `agents.py`. This module re-exports the plain one
so the existing chat route is unchanged by the addition of /compare.
"""

from app.agents import plain as agent

__all__ = ["agent"]
