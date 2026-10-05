from contextlib import closing
from pathlib import Path
import sqlite3
import tempfile
import unittest

from fastapi import FastAPI
import httpx

from app.api.movies import router
from app.core.config import Settings, get_settings
from app.services.movies.repository import MoviesRepository, SCHEMA_VERSION


class MoviesRepositoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repository = MoviesRepository(self.root / "movies")

    def test_construction_has_no_side_effects(self):
        self.assertFalse(self.repository.path.parent.exists())

    def test_initialisation_is_idempotent_and_isolated(self):
        library = self.root / "playlists.json"
        library.write_text('{"existing": true}', encoding="utf-8")
        profile = self.repository.initialise()
        self.assertEqual(self.repository.initialise(), profile)
        with closing(sqlite3.connect(self.repository.path)) as connection, connection:
            self.assertEqual(connection.execute("PRAGMA user_version").fetchone()[0], SCHEMA_VERSION)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM profiles").fetchone()[0], 1)
        self.assertEqual(library.read_text(encoding="utf-8"), '{"existing": true}')

    def test_provider_ids_are_kind_scoped(self):
        self.repository.initialise()
        with closing(sqlite3.connect(self.repository.path)) as connection, connection:
            for kind in ("movie", "show"):
                connection.execute("INSERT INTO titles(id,kind,title) VALUES (?, ?, ?)", (kind, kind, "Test"))
                connection.execute("INSERT INTO provider_refs VALUES (?, ?, ?, ?)", (kind, "tmdb", kind, "123"))
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute("INSERT INTO provider_refs VALUES ('movie', 'tmdb', 'movie', '123')")

    def test_future_schema_is_not_downgraded(self):
        self.repository.initialise()
        with closing(sqlite3.connect(self.repository.path)) as connection, connection:
            connection.execute("PRAGMA user_version = 99")
        with self.assertRaisesRegex(ValueError, "Unsupported Movies"):
            self.repository.initialise()
        with closing(sqlite3.connect(self.repository.path)) as connection, connection:
            self.assertEqual(connection.execute("PRAGMA user_version").fetchone()[0], 99)

    def test_partial_migration_rolls_back(self):
        self.repository.path.parent.mkdir()
        with closing(sqlite3.connect(self.repository.path)) as connection, connection:
            connection.execute("CREATE TABLE titles (id TEXT)")
        with self.assertRaises(sqlite3.OperationalError):
            self.repository.initialise()
        with closing(sqlite3.connect(self.repository.path)) as connection, connection:
            self.assertEqual(connection.execute("PRAGMA user_version").fetchone()[0], 0)
            self.assertIsNone(connection.execute("SELECT name FROM sqlite_master WHERE name = 'profiles'").fetchone())


class MoviesStatusTests(unittest.IsolatedAsyncioTestCase):
    async def test_status_is_truthful_and_never_initialises_data(self):
        with tempfile.TemporaryDirectory() as directory:
            data_dir = Path(directory) / "movies"
            app = FastAPI()
            app.include_router(router, prefix="/api")
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                for enabled in (False, True):
                    settings = Settings(_env_file=None, MOVIES_ENABLED=enabled, MOVIES_DATA_DIR=data_dir)
                    app.dependency_overrides[get_settings] = lambda: settings
                    response = await client.get("/api/movies/status")
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual(response.headers['cache-control'], 'no-store')
                    self.assertEqual(response.json(), {
                        "enabled": enabled, "stage": "local",
                        "catalogue_available": enabled, "playback_available": False,
                        "metadata_configured": False, "media_configured": False, "local_access": True,
                        "schema_version": SCHEMA_VERSION,
                    })
                    self.assertFalse(data_dir.exists())


if __name__ == "__main__":
    unittest.main()
