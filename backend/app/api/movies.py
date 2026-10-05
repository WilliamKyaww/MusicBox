"""Movies capabilities, independent of YouTube and the existing music library."""

from typing import Literal

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel

from app.core.config import Settings, get_settings
from app.services.movies.repository import SCHEMA_VERSION

router = APIRouter(prefix="/movies")


class MoviesStatus(BaseModel):
    enabled: bool
    stage: Literal["foundation"] = "foundation"
    catalogue_available: bool = False
    playback_available: bool = False
    schema_version: int = SCHEMA_VERSION


@router.get("/status", response_model=MoviesStatus)
def get_movies_status(response: Response, settings: Settings = Depends(get_settings)):
    # Reading capabilities must not create a database or contact a content provider.
    response.headers["Cache-Control"] = "no-store"
    return MoviesStatus(enabled=settings.movies_enabled)
