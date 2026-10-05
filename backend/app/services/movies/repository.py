"""Local Movies persistence; independent from the Video/Music registries."""

from contextlib import closing
from contextlib import contextmanager
import json
import time
from pathlib import Path
import sqlite3
from uuid import uuid4

SCHEMA_VERSION = 3

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
                if version not in (0, 1, 2, SCHEMA_VERSION):
                    raise ValueError("Unsupported Movies database version; no changes were made.")
                if version == 0:
                    for statement in _SCHEMA:
                        connection.execute(statement)
                if version < 2:
                    for statement in (
                        "ALTER TABLE titles ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'",
                        """CREATE TABLE assets (id TEXT PRIMARY KEY, title_id TEXT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
                             relative_path TEXT NOT NULL UNIQUE, label TEXT NOT NULL, duration REAL NOT NULL,
                             height INTEGER NOT NULL, video_codec TEXT NOT NULL, audio_codec TEXT NOT NULL)""",
                        """CREATE TABLE watchlist (profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
                             title_id TEXT NOT NULL REFERENCES titles(id) ON DELETE CASCADE, added_at REAL NOT NULL,
                             PRIMARY KEY(profile_id, title_id))""",
                        """CREATE TABLE progress (profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
                             title_id TEXT NOT NULL REFERENCES titles(id) ON DELETE CASCADE, position REAL NOT NULL DEFAULT 0,
                             duration REAL NOT NULL DEFAULT 0, completed INTEGER NOT NULL DEFAULT 0, updated_at REAL NOT NULL,
                             session_id TEXT NOT NULL, sequence INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(profile_id, title_id))""",
                    ):
                        connection.execute(statement)
                    connection.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
                if version < 3:
                    connection.execute('ALTER TABLE assets ADD COLUMN intro_start REAL NOT NULL DEFAULT 0')
                    connection.execute('ALTER TABLE assets ADD COLUMN intro_end REAL NOT NULL DEFAULT 0')
                    connection.execute('ALTER TABLE assets ADD COLUMN rights_confirmed_at REAL')
                    connection.execute(f'PRAGMA user_version = {SCHEMA_VERSION}')
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

    @contextmanager
    def connect(self):
        self.initialise()
        with closing(sqlite3.connect(self.path, timeout=10)) as connection, connection:
            connection.row_factory = sqlite3.Row
            connection.execute("PRAGMA foreign_keys = ON")
            yield connection

    def profiles(self):
        with self.connect() as db:
            return [dict(row) for row in db.execute("SELECT * FROM profiles ORDER BY local_default DESC, name")]

    def require_profile(self, profile_id):
        with self.connect() as db:
            if not db.execute("SELECT 1 FROM profiles WHERE id=?", (profile_id,)).fetchone():
                raise LookupError("Profile not found. Choose an existing profile.")

    def create_profile(self, name):
        with self.connect() as db:
            if db.execute("SELECT COUNT(*) FROM profiles").fetchone()[0] >= 8:
                raise ValueError("This installation supports up to eight local profiles.")
            profile_id = str(uuid4())
            db.execute("INSERT INTO profiles VALUES (?, ?, 0)", (profile_id, name))
            return {"id": profile_id, "name": name, "local_default": 0}

    def delete_profile(self, profile_id):
        with self.connect() as db:
            row = db.execute("SELECT local_default FROM profiles WHERE id=?", (profile_id,)).fetchone()
            if not row:
                raise LookupError("Profile not found.")
            if row[0]:
                raise ValueError("The default local profile cannot be deleted.")
            db.execute("DELETE FROM profiles WHERE id=?", (profile_id,))

    def save_title(self, item):
        with self.connect() as db:
            db.execute("""INSERT INTO titles(id,kind,title,metadata_json) VALUES(?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET title=excluded.title, metadata_json=excluded.metadata_json""",
                (item['id'], item['kind'], item['title'], json.dumps(item)))
        return item

    def title(self, title_id):
        with self.connect() as db:
            row = db.execute("SELECT metadata_json FROM titles WHERE id=?", (title_id,)).fetchone()
            return json.loads(row[0]) if row else None

    def local_titles(self):
        with self.connect() as db:
            return [json.loads(row[0]) for row in db.execute(
                "SELECT metadata_json FROM titles WHERE id LIKE 'local:%' OR id IN (SELECT title_id FROM assets) ORDER BY title LIMIT 1000")]

    def assets(self, title_id):
        with self.connect() as db:
            return [dict(row) for row in db.execute("SELECT * FROM assets WHERE title_id=? ORDER BY height DESC, id", (title_id,))]

    def asset(self, asset_id):
        with self.connect() as db:
            row = db.execute("SELECT * FROM assets WHERE id=?", (asset_id,)).fetchone()
            return dict(row) if row else None

    def add_asset(self, title_id, relative_path, probe):
        with self.connect() as db:
            existing = db.execute("SELECT id,title_id FROM assets WHERE relative_path=?", (relative_path,)).fetchone()
            if existing:
                if existing['title_id'] != title_id:
                    raise ValueError("This file is already registered to another title.")
                return existing['id']
            asset_id = str(uuid4())
            db.execute("""INSERT INTO assets(id,title_id,relative_path,label,duration,height,video_codec,audio_codec,intro_start,intro_end,rights_confirmed_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?)""", (
                asset_id, title_id, relative_path, probe['label'], probe['duration'], probe['height'], probe['video_codec'], probe['audio_codec'],
                probe.get('intro_start',0),probe.get('intro_end',0),time.time()))
            return asset_id

    def asset_by_path(self, relative_path):
        with self.connect() as db:
            row = db.execute("SELECT * FROM assets WHERE relative_path=?", (relative_path,)).fetchone()
            return dict(row) if row else None

    def remove_asset(self, asset_id):
        with self.connect() as db:
            db.execute("DELETE FROM assets WHERE id=?", (asset_id,))

    def list_saved(self, profile_id, history=False):
        self.require_profile(profile_id)
        with self.connect() as db:
            if history:
                rows = db.execute("""SELECT t.metadata_json,p.position,p.duration,p.completed,p.updated_at
                    FROM progress p JOIN titles t ON p.title_id=t.id WHERE profile_id=? AND position>0
                    ORDER BY updated_at DESC LIMIT 200""", (profile_id,))
            else:
                rows = db.execute("""SELECT t.metadata_json FROM watchlist w JOIN titles t ON w.title_id=t.id
                    WHERE profile_id=? ORDER BY added_at DESC LIMIT 1000""", (profile_id,))
            result = []
            for row in rows:
                item = json.loads(row['metadata_json'])
                if history:
                    item['progress'] = {key: row[key] for key in ('position','duration','completed','updated_at')}
                result.append(item)
            return result

    def set_saved(self, profile_id, title_id, saved):
        self.require_profile(profile_id)
        with self.connect() as db:
            if saved:
                db.execute("INSERT OR IGNORE INTO watchlist VALUES(?,?,?)", (profile_id, title_id, time.time()))
            else:
                db.execute("DELETE FROM watchlist WHERE profile_id=? AND title_id=?", (profile_id, title_id))

    def state(self, profile_id, title_id):
        self.require_profile(profile_id)
        with self.connect() as db:
            progress = db.execute("SELECT position,duration,completed,updated_at FROM progress WHERE profile_id=? AND title_id=?", (profile_id,title_id)).fetchone()
            saved = db.execute("SELECT 1 FROM watchlist WHERE profile_id=? AND title_id=?", (profile_id,title_id)).fetchone()
            return {"saved": bool(saved), "progress": dict(progress) if progress else None}

    def start_session(self, profile_id, title_id):
        self.require_profile(profile_id)
        session_id = str(uuid4())
        with self.connect() as db:
            db.execute("""INSERT INTO progress(profile_id,title_id,updated_at,session_id) VALUES(?,?,?,?)
                ON CONFLICT(profile_id,title_id) DO UPDATE SET session_id=excluded.session_id,sequence=0""",
                (profile_id,title_id,time.time(),session_id))
        return session_id

    def progress(self, profile_id, title_id, session_id, sequence, position, duration):
        self.require_profile(profile_id)
        position = min(position, duration)
        with self.connect() as db:
            result = db.execute("""UPDATE progress SET position=?,duration=?,completed=?,updated_at=?,sequence=?
                WHERE profile_id=? AND title_id=? AND session_id=? AND sequence<?""",
                (position,duration,int(position >= duration * .95),time.time(),sequence,profile_id,title_id,session_id,sequence))
            return bool(result.rowcount)

    def remove_history(self, profile_id, title_id=None):
        self.require_profile(profile_id)
        with self.connect() as db:
            if title_id:
                db.execute("DELETE FROM progress WHERE profile_id=? AND title_id=?", (profile_id,title_id))
            else:
                db.execute("DELETE FROM progress WHERE profile_id=?", (profile_id,))
