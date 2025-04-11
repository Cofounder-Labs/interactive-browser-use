"""
FastAPI application for browser agent web interface.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
# Removed StaticFiles and FileResponse imports
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
    title="Browser Agent API", # Updated title
    description="Backend API for controlling browser automation tasks.", # Updated description
    version="0.1.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Removed static file mounting section

@app.on_event("startup")
async def startup_event():
    """Launch Chrome with debugging on startup"""
    port = int(os.getenv("CHROME_DEBUG_PORT", "9222"))
    app_port = int(os.getenv("APP_PORT", "8000"))
    if not launch_chrome_with_debugging(port=port, app_port=app_port):
        logger.error("Failed to launch Chrome with debugging enabled. Agent functionality might be impaired.")

# Removed @app.get("/") endpoint

# Removed old /tasks, /tasks/{task_id}/start, /tasks/{task_id}/stop endpoints

# Removed @app.websocket("/ws") endpoint and websocket_endpoint function
# Removed run_task helper function

# Include the API router from routes.py
app.include_router(api_router)

# Removed old agent_router and ws_router includes 