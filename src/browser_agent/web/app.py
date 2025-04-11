"""
FastAPI application for browser agent web interface.
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
import logging
import json
from pathlib import Path
from typing import Dict, Optional, List
from pydantic import BaseModel
import uuid
import asyncio
from browser_agent.agent import BrowserAgent
from langchain_openai import ChatOpenAI

# Configure logging
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Browser Agent Web Interface",
    description="Interactive web interface for controlling and observing browser automation tasks.",
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
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

# Store active WebSocket connections
active_connections: Dict[str, WebSocket] = {}
# Store active tasks
active_tasks: Dict[str, Dict] = {}

class TaskCreate(BaseModel):
    """Task creation request model."""
    description: str
    auto_approve: bool = False

class TaskResponse(BaseModel):
    """Task response model."""
    task_id: str
    status: str

@app.get("/")
async def get():
    return FileResponse("src/browser_agent/web/static/index.html")

@app.post("/tasks", response_model=TaskResponse)
async def create_task(task: TaskCreate):
    """Create a new task."""
    agent = BrowserAgent(task.description)
    task_id = str(len(active_tasks))
    active_tasks[task_id] = agent
    return TaskResponse(task_id=task_id, status="created")

@app.post("/tasks/{task_id}/start")
async def start_task(task_id: str):
    """Start a task."""
    if task_id not in active_tasks:
        return {"error": "Task not found"}
    agent = active_tasks[task_id]
    await agent.start()
    return {"status": "started"}

@app.post("/tasks/{task_id}/stop")
async def stop_task(task_id: str):
    """Stop a task."""
    if task_id not in active_tasks:
        return {"error": "Task not found"}
    agent = active_tasks[task_id]
    await agent.stop()
    return {"status": "stopped"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connection_id = str(uuid.uuid4())
    active_connections[connection_id] = websocket
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message["type"] == "start_task":
                task_id = str(uuid.uuid4())
                task_description = message["description"]
                auto_approve = message.get("auto_approve", False)
                
                # Initialize the browser agent
                agent = BrowserAgent(task=task_description)
                
                # Store task information
                active_tasks[task_id] = {
                    "description": task_description,
                    "agent": agent,
                    "auto_approve": auto_approve,
                    "connection_id": connection_id
                }
                
                # Send task started message
                await websocket.send_json({
                    "type": "task_started",
                    "task_id": task_id,
                    "description": task_description
                })
                
                # Start the task in the background
                asyncio.create_task(run_task(task_id))
                
            elif message["type"] == "stop_task":
                task_id = message["task_id"]
                if task_id in active_tasks:
                    task = active_tasks[task_id]
                    await task["agent"].stop()
                    del active_tasks[task_id]
                    
                    await websocket.send_json({
                        "type": "task_stopped",
                        "task_id": task_id
                    })
                    
            elif message["type"] == "approve_step":
                task_id = message["task_id"]
                step_id = message["step_id"]
                approved = message["approved"]
                
                if task_id in active_tasks:
                    task = active_tasks[task_id]
                    task["agent"].approve_step(step_id, approved)
                    
    except WebSocketDisconnect:
        # Clean up connections and tasks
        if connection_id in active_connections:
            del active_connections[connection_id]
        
        # Stop and remove any tasks associated with this connection
        tasks_to_remove = [
            task_id for task_id, task in active_tasks.items()
            if task["connection_id"] == connection_id
        ]
        for task_id in tasks_to_remove:
            if task_id in active_tasks:
                task = active_tasks[task_id]
                await task["agent"].stop()
                del active_tasks[task_id]

async def run_task(task_id: str):
    if task_id not in active_tasks:
        return
        
    task = active_tasks[task_id]
    websocket = active_connections.get(task["connection_id"])
    
    if not websocket:
        return
        
    try:
        # Set up event handler
        def handle_event(event_type: str, message: str):
            asyncio.create_task(websocket.send_json({
                "type": "event",
                "event_type": event_type,
                "message": message
            }))
            
        # Set up step approval handler
        def handle_step_approval(step_id: str, description: str):
            if task["auto_approve"]:
                task["agent"].approve_step(step_id, True)
            else:
                asyncio.create_task(websocket.send_json({
                    "type": "step_approval_required",
                    "step_id": step_id,
                    "description": description
                }))
                
        # Start the task
        await task["agent"].start()
        
        # Send task completed message
        await websocket.send_json({
            "type": "task_completed",
            "task_id": task_id
        })
        
    except Exception as e:
        # Send error message
        await websocket.send_json({
            "type": "task_failed",
            "task_id": task_id,
            "error": str(e)
        })
        
    finally:
        # Clean up
        if task_id in active_tasks:
            del active_tasks[task_id]

# Import and include routers
from .routes import agent_router, ws_router

app.include_router(agent_router)
app.include_router(ws_router) 