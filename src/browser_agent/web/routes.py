"""
API routes for browser agent control and WebSocket communication.
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, Dict, Any
import logging
import asyncio
from ..agent import BrowserAgent

# Configure logging
logger = logging.getLogger(__name__)

# Create routers
agent_router = APIRouter(prefix="/api", tags=["agent"])
ws_router = APIRouter(tags=["websocket"])

# Models for request/response
class TaskRequest(BaseModel):
    task: str
    auto_approve: bool = False

class TaskResponse(BaseModel):
    task_id: str
    status: str
    message: str

# Store active agents and their WebSocket connections
active_agents: Dict[str, BrowserAgent] = {}
active_connections: Dict[str, WebSocket] = {}

@agent_router.post("/task", response_model=TaskResponse)
async def create_task(task_request: TaskRequest, background_tasks: BackgroundTasks):
    """Create a new browser automation task."""
    try:
        # Create a unique task ID
        task_id = f"task_{len(active_agents) + 1}"
        
        # Initialize the agent with event callback
        async def on_event(event: Dict[str, Any]):
            if task_id in active_connections:
                await active_connections[task_id].send_json(event)
        
        agent = BrowserAgent(task_request.task, on_event=on_event)
        active_agents[task_id] = agent
        
        # Start the agent in the background if auto-approve is enabled
        if task_request.auto_approve:
            background_tasks.add_task(agent.start)
        
        return TaskResponse(
            task_id=task_id,
            status="created",
            message="Task created successfully"
        )
        
    except Exception as e:
        logger.error(f"Error creating task: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@agent_router.post("/task/{task_id}/start")
async def start_task(task_id: str, background_tasks: BackgroundTasks):
    """Start a browser automation task."""
    if task_id not in active_agents:
        raise HTTPException(status_code=404, detail="Task not found")
    
    try:
        agent = active_agents[task_id]
        background_tasks.add_task(agent.start)
        return {"status": "started", "message": "Task started successfully"}
    except Exception as e:
        logger.error(f"Error starting task: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@agent_router.post("/task/{task_id}/stop")
async def stop_task(task_id: str):
    """Stop a browser automation task."""
    if task_id not in active_agents:
        raise HTTPException(status_code=404, detail="Task not found")
    
    try:
        agent = active_agents[task_id]
        await agent.stop()
        del active_agents[task_id]
        return {"status": "stopped", "message": "Task stopped successfully"}
    except Exception as e:
        logger.error(f"Error stopping task: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@ws_router.websocket("/ws/{task_id}")
async def websocket_endpoint(websocket: WebSocket, task_id: str):
    """WebSocket endpoint for real-time task updates."""
    if task_id not in active_agents:
        await websocket.close(code=4004, reason="Task not found")
        return
    
    try:
        await websocket.accept()
        active_connections[task_id] = websocket
        
        try:
            while True:
                # Keep the connection alive and handle client messages
                data = await websocket.receive_json()
                if data.get("type") == "approve_step":
                    # Handle step approval logic here
                    pass
                
        except WebSocketDisconnect:
            logger.info(f"WebSocket disconnected for task {task_id}")
        finally:
            if task_id in active_connections:
                del active_connections[task_id]
                
    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
        if task_id in active_connections:
            del active_connections[task_id] 