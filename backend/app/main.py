from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import exercises, routines, sync

app = FastAPI(title="GymLog API", version="0.1.0")

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


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "version": "0.1.0"}
