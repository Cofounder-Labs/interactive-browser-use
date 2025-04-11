"""
API routes for browser agent control and WebSocket communication.
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import logging
import asyncio
import uuid
from ..agent import BrowserAgent

# Configure logging
logger = logging.getLogger(__name__)

# Create router
api_router = APIRouter(prefix="/api", tags=["agent"])

# Models for request/response
class TaskCreateRequest(BaseModel):
    description: str

class TaskStatusResponse(BaseModel):
    task_id: str
    description: str
    status: str
    events: List[Dict[str, Any]]

class TaskInfo(BaseModel):
    task_id: str
    description: str
    status: str
    message: Optional[str] = None

# Store active tasks and their states
# Structure: {task_id: {"agent": BrowserAgent, "description": str, "status": str, "events": []}}
active_tasks: Dict[str, Dict[str, Any]] = {}

# --- Callback functions to update task state ---

async def _handle_event(task_id: str, event: Dict[str, Any]):
    """Appends an event received from the agent to the task's event list."""
    if task_id in active_tasks:
        # Store the raw event dictionary
        active_tasks[task_id]["events"].append(event)
        event_type = event.get("type", "unknown")
        message = event.get("message", str(event))
        logger.info(f"Task {task_id}: Event '{event_type}' - {message}")
    else:
        logger.warning(f"Task {task_id} not found when handling event: {event}")

async def _run_agent_task(task_id: str):
    """Runs the agent's start method and handles completion/failure."""
    if task_id not in active_tasks:
        logger.error(f"Task {task_id} not found for running.")
        return

    task_state = active_tasks[task_id]
    agent = task_state["agent"]
    
    try:
        logger.info(f"Task {task_id}: Starting agent.")
        task_state["status"] = "running"
        await agent.start() # Agent runs to completion or failure
        
        # Check final state if not already failed or stopped
        if task_state["status"] == "running": # Check if it wasn't stopped externally
             logger.info(f"Task {task_id}: Agent task completed successfully.")
             task_state["status"] = "completed"
             # Use the callback to log completion event
             await _handle_event(task_id, {"type": "info", "message": "Task completed successfully."}) 

    except Exception as e:
        logger.error(f"Task {task_id}: Agent task failed: {str(e)}")
        if task_id in active_tasks: # Check if task wasn't stopped/deleted
            task_state["status"] = "failed"
            # Use the callback to log the error event
            await _handle_event(task_id, {"type": "error", "message": f"Task execution failed: {str(e)}"}) 
    # Note: No explicit cleanup here, task remains in active_tasks unless stopped

# --- API Endpoints ---

@api_router.post("/tasks", response_model=TaskInfo, status_code=201)
async def create_task(task_request: TaskCreateRequest, background_tasks: BackgroundTasks):
    """Creates a new browser automation task and starts it."""
    task_id = str(uuid.uuid4())
    description = task_request.description

    try:
        # Create task-specific event callback
        async def on_event_wrapper(event: Dict[str, Any]):
            await _handle_event(task_id, event)

        # Initialize agent with the event callback
        # NOTE: This still assumes BrowserAgent uses this callback. 
        # Based on agent.py, it might not be called frequently or at all.
        agent = BrowserAgent(
            task=description, 
            on_event=on_event_wrapper, 
        )
        
        active_tasks[task_id] = {
            "agent": agent,
            "description": description,
            "status": "created",
            "events": [],
        }
        
        # Add the agent execution to background tasks
        background_tasks.add_task(_run_agent_task, task_id)
        
        logger.info(f"Task {task_id} created: {description}")
        return TaskInfo(
            task_id=task_id,
            description=description,
            status="created",
            message="Task created and initiated successfully."
        )
        
    except Exception as e:
        logger.error(f"Error creating task '{description}': {str(e)}")
        if task_id in active_tasks:
            del active_tasks[task_id]
        raise HTTPException(status_code=500, detail=f"Failed to create task: {str(e)}")

@api_router.get("/tasks/{task_id}", response_model=TaskStatusResponse)
async def get_task_status(task_id: str):
    """Retrieves the current status and events for a task."""
    if task_id not in active_tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task_state = active_tasks[task_id]
    
    return TaskStatusResponse(
        task_id=task_id,
        description=task_state["description"],
        status=task_state["status"],
        events=task_state["events"],
    )

@api_router.post("/tasks/{task_id}/stop", response_model=TaskInfo)
async def stop_task(task_id: str):
    """Stops a running browser automation task."""
    if task_id not in active_tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task_state = active_tasks[task_id]
    agent = task_state["agent"]
    
    # Check if task is already in a terminal state
    if task_state["status"] in ["stopped", "completed", "failed"]:
        return TaskInfo(task_id=task_id, description=task_state["description"], status=task_state["status"], message="Task was already inactive.")

    try:
        logger.info(f"Task {task_id}: Attempting to stop agent.")
        await agent.stop() # Assuming agent.stop() is async
        task_state["status"] = "stopped"
        await _handle_event(task_id, {"type": "info", "message": "Task stopped by user request."}) # Log stop event
        logger.info(f"Task {task_id}: Agent stopped successfully.")
        
        return TaskInfo(
            task_id=task_id, 
            description=task_state["description"],
            status="stopped", 
            message="Task stopped successfully."
        )
    except Exception as e:
        logger.error(f"Task {task_id}: Error stopping task: {str(e)}")
        task_state["status"] = "failed" 
        await _handle_event(task_id, {"type": "error", "message": f"Error stopping task: {str(e)}"}) # Log stop error
        raise HTTPException(status_code=500, detail=f"Failed to stop task cleanly: {str(e)}") 