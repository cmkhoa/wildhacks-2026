from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
import contextlib
from dotenv import load_dotenv

load_dotenv()  # Load environment variables from .env file

# Fix dnspython on macOS: it can't read /etc/resolv.conf (permission denied),
# which breaks mongodb+srv:// SRV lookups. Use Google's public DNS instead.
try:
    import dns.resolver
    dns.resolver.default_resolver = dns.resolver.Resolver(configure=False)
    dns.resolver.default_resolver.nameservers = ["8.8.8.8", "8.8.4.4"]
except Exception:
    pass

from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from models import User, Task, Subtask
from routers import auth, chat, tasks, rewards

@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    mongo_uri = os.environ.get("MONGODB_URI", "mongodb://localhost:27017")
    try:
        app.mongodb_client = AsyncIOMotorClient(mongo_uri, serverSelectionTimeoutMS=3000)
        app.database = app.mongodb_client.wildhacks
        await init_beanie(database=app.database, document_models=[User, Task, Subtask])
        print("✅ Connected to MongoDB")
    except Exception as e:
        print(f"⚠️  MongoDB not available ({e}). Running without database persistence.")
        app.mongodb_client = None
        app.database = None
    yield
    if getattr(app, 'mongodb_client', None):
        app.mongodb_client.close()

app = FastAPI(title="ADHD Agentic Calendar App Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(tasks.router)
app.include_router(rewards.router)

@app.get("/api/health")
def health_check():
    return {"status": "ok"}

@app.get("/")
def root():
    return {"message": "Welcome to Chronos API for ADHD Calendar"}

if __name__ == "__main__":
    import uvicorn
    # Default to 8080 as requested
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
