from contextlib import asynccontextmanager

from beanie import init_beanie
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient

from app.config import get_settings
from app.models import DOCUMENT_MODELS
from app.routers import audit, auth, bundles, databases, scripts, servers, users
from app.seed import seed_admin


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    client = AsyncIOMotorClient(settings.mongo_uri)
    db_name = settings.mongo_uri.rsplit("/", 1)[-1].split("?")[0] or "scriptrunner"
    await init_beanie(database=client[db_name], document_models=DOCUMENT_MODELS)
    await seed_admin()
    yield
    client.close()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Script Runner API", version="1.0.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router, prefix="/api")
    app.include_router(users.router, prefix="/api")
    app.include_router(servers.router, prefix="/api")
    app.include_router(databases.router, prefix="/api")
    app.include_router(scripts.router, prefix="/api")
    app.include_router(bundles.router, prefix="/api")
    app.include_router(audit.router, prefix="/api")

    @app.get("/api/health")
    async def health():
        return {"status": "ok", "service": "script-runner"}

    return app


app = create_app()
