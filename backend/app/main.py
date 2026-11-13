from contextlib import asynccontextmanager

from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import admin, exercises, routines, sync


@asynccontextmanager
async def lifespan(app: FastAPI):
    cfg = Config("alembic.ini")
    command.upgrade(cfg, "head")
    yield


app = FastAPI(title="GymLog API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=86400,  # cachear preflights 24h — una vez que pasa, no vuelve a preguntar
)

app.include_router(exercises.router)
app.include_router(routines.router)
app.include_router(sync.router)
app.include_router(admin.router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "version": "0.1.0"}
