"""
FastAPI application for browser agent web interface.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
import logging
from pathlib import Path
# Removed WebSocket, WebSocketDisconnect, Dict, Optional, List, BaseModel, uuid, asyncio
# Removed BrowserAgent, ChatOpenAI (assuming these are not directly used in app.py anymore)
from browser_agent.utils.chrome import launch_chrome_with_debugging
# Import the new api_router
from .routes import api_router

# Configure logging
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Browser Agent Web Interface",
    description="Interactive web interface for controlling and observing browser automation tasks via REST API.",
    version="0.1.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files if they exist
static_dir = Path(__file__).parent / "static"
if static_dir.exists() and static_dir.is_dir():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")
else:
    logger.warning(f"Static directory not found at {static_dir}, skipping static file mounting.")

# Removed active_connections dictionary
# Removed active_tasks dictionary (now managed in routes.py)
# Removed TaskCreate and TaskResponse models (now defined in routes.py)

@app.on_event("startup")
async def startup_event():
    """Launch Chrome with debugging on startup"""
    port = int(os.getenv("CHROME_DEBUG_PORT", "9222"))
    app_port = int(os.getenv("APP_PORT", "8000"))
    if not launch_chrome_with_debugging(port=port, app_port=app_port):
        # Consider how fatal this should be. Maybe just log an error?
        logger.error("Failed to launch Chrome with debugging enabled. Agent functionality might be impaired.")
        # raise RuntimeError("Failed to launch Chrome with debugging enabled")

@app.get("/")
async def get_root():
    """Serve the main HTML page."""
    html_file = Path(__file__).parent / "static" / "index.html"
    if html_file.is_file():
        return FileResponse(str(html_file))
    else:
        logger.error(f"index.html not found at {html_file}")
        return {"message": "Frontend not found."}, 500

# Removed old /tasks, /tasks/{task_id}/start, /tasks/{task_id}/stop endpoints

# Removed @app.websocket("/ws") endpoint and websocket_endpoint function
# Removed run_task helper function

# Include the API router from routes.py
app.include_router(api_router)

# Removed old agent_router and ws_router includes 