"""Opt-in schema foundation. No runtime caller creates Movies data yet."""

from contextlib import closing
from pathlib import Path
import sqlite3
from uuid import uuid4

SCHEMA_VERSION = 1

_SCHEMA = (
    """CREATE TABLE profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        local_default INTEGER NOT NULL DEFAULT 0 CHECK (local_default IN (0, 1))
    )""",
    "CREATE UNIQUE INDEX one_local_profile ON profiles(local_default) WHERE local_default = 1",
    """CREATE TABLE titles (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('movie', 'show', 'episode')),
        title TEXT NOT NULL
    )""",
    """CREATE TABLE provider_refs (
        title_id TEXT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('movie', 'show', 'episode')),
        provider_id TEXT NOT NULL,
        PRIMARY KEY (provider, kind, provider_id)
    )""",
)


class MoviesRepository:
    def __init__(self, data_dir: Path):
        self.path = data_dir / "movies.sqlite3"

    def initialise(self) -> str:
        """Atomically initialise schema and return the installation's local profile ID.

        This is not an authenticated account or permission boundary. Hosted profiles
        and playback/watch-state tables need their own later implementation gates.
        """
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self.path, timeout=10)) as connection:
            connection.execute("PRAGMA foreign_keys = ON")
            connection.execute("BEGIN IMMEDIATE")
            try:
                version = connection.execute("PRAGMA user_version").fetchone()[0]
                if version not in (0, SCHEMA_VERSION):
                    raise ValueError("Unsupported Movies database version; no changes were made.")
                if version == 0:
                    for statement in _SCHEMA:
                        connection.execute(statement)
                    connection.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
                profile = connection.execute(
                    "SELECT id FROM profiles WHERE local_default = 1"
                ).fetchone()
                profile_id = profile[0] if profile else str(uuid4())
                if profile is None:
                    connection.execute(
                        "INSERT INTO profiles(id, name, local_default) VALUES (?, ?, 1)",
                        (profile_id, "Local profile"),
                    )
                connection.commit()
                return profile_id
            except BaseException:
                connection.rollback()
                raise
