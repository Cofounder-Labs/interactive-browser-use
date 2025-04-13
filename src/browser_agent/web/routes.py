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

# NEW Endpoint: Get just the status of a task
class TaskStatusOnlyResponse(BaseModel):
    status: str

# NEW: Step data model
class StepDataResponse(BaseModel):
    pending_approval: bool
    url: Optional[str] = None
    action: Optional[Dict[str, Any]] = None
    thought: Optional[Any] = None  # Change type to Any to accept various thought formats
    step_number: Optional[int] = None

# NEW: Approval response
class ApprovalResponse(BaseModel):
    success: bool
    message: str

# NEW: Action data model
class ActionDataResponse(BaseModel):
    pending_approval: bool
    action: Optional[Dict[str, Any]] = None
    next_goal: Optional[str] = None
    index: Optional[int] = None
    total: Optional[int] = None
    url: Optional[str] = None
    step_number: Optional[int] = None

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

@api_router.get("/tasks/{task_id}/status", response_model=TaskStatusOnlyResponse)
async def get_task_status_only(task_id: str):
    """Retrieves just the current status string for a task."""
    if task_id not in active_tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return TaskStatusOnlyResponse(status=active_tasks[task_id]["status"])

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

# NEW: Get current step data endpoint
@api_router.get("/tasks/{task_id}/step", response_model=StepDataResponse)
async def get_step_data(task_id: str):
    """Gets information about the current step waiting for approval."""
    if task_id not in active_tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task_state = active_tasks[task_id]
    agent = task_state["agent"]
    
    # Get current step data from agent
    step_data = await agent.get_current_step()
    
    if step_data is None:
        # No pending step
        return StepDataResponse(pending_approval=False)
    
    # Convert thought to dictionary if it's not already
    thought = step_data.get("thought")
    if thought is not None:
        try:
            # Try to convert to dictionary if it's a serializable object
            if hasattr(thought, "__dict__"):
                thought = thought.__dict__
            else:
                # Fall back to converting to string
                thought = {"content": str(thought)}
        except Exception as e:
            logger.warning(f"Failed to serialize thought: {str(e)}")
            thought = {"content": str(thought)}
    
    # Convert action to dictionary if it's not already
    action = step_data.get("action")
    if action is not None and not isinstance(action, dict):
        try:
            # Try to convert to dictionary if it's a serializable object
            if hasattr(action, "__dict__"):
                action = action.__dict__
            else:
                # Fall back to converting to string
                action = {"content": str(action)}
        except Exception as e:
            logger.warning(f"Failed to serialize action: {str(e)}")
            action = {"content": str(action)}
    
    return StepDataResponse(
        pending_approval=True,
        url=step_data.get("url"),
        action=action,
        thought=thought,
        step_number=step_data.get("step_number")
    )

# NEW: Approve step endpoint
@api_router.post("/tasks/{task_id}/approve", response_model=ApprovalResponse)
async def approve_step(task_id: str):
    """Approves the current step, allowing the agent to proceed."""
    if task_id not in active_tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task_state = active_tasks[task_id]
    agent = task_state["agent"]
    
    # Check if task is in a state that can be approved
    if task_state["status"] not in ["running"]:
        return ApprovalResponse(
            success=False,
            message=f"Task is in '{task_state['status']}' state and cannot be approved"
        )
    
    # Try to approve the step
    success = await agent.approve_step()
    
    if success:
        await _handle_event(task_id, {"type": "user_action", "message": "User approved the step"})
        return ApprovalResponse(success=True, message="Step approved successfully")
    else:
        return ApprovalResponse(success=False, message="No step is pending approval")

# NEW: Reject step endpoint
@api_router.post("/tasks/{task_id}/reject", response_model=ApprovalResponse)
async def reject_step(task_id: str):
    """Rejects the current step, causing the agent to pause."""
    if task_id not in active_tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task_state = active_tasks[task_id]
    agent = task_state["agent"]
    
    # Check if task is in a state that can be rejected
    if task_state["status"] not in ["running"]:
        return ApprovalResponse(
            success=False,
            message=f"Task is in '{task_state['status']}' state and cannot be rejected"
        )
    
    # Try to reject the step
    success = await agent.reject_step()
    
    if success:
        task_state["status"] = "paused"
        await _handle_event(task_id, {"type": "user_action", "message": "User rejected the step, agent paused"})
        return ApprovalResponse(success=True, message="Step rejected, agent paused")
    else:
        return ApprovalResponse(success=False, message="No step is pending approval")

# NEW: Resume paused task endpoint
@api_router.post("/tasks/{task_id}/resume", response_model=TaskInfo)
async def resume_task(task_id: str):
    """Resumes a paused task."""
    if task_id not in active_tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task_state = active_tasks[task_id]
    agent = task_state["agent"]
    
    # Check if task is paused
    if task_state["status"] != "paused":
        return TaskInfo(
            task_id=task_id,
            description=task_state["description"],
            status=task_state["status"],
            message=f"Task is in '{task_state['status']}' state and cannot be resumed"
        )
    
    try:
        # Only resume if the agent exists
        if agent.agent:
            agent.agent.resume()
            task_state["status"] = "running"
            await _handle_event(task_id, {"type": "user_action", "message": "User resumed the task"})
            return TaskInfo(
                task_id=task_id,
                description=task_state["description"],
                status="running",
                message="Task resumed successfully"
            )
        else:
            logger.error(f"Task {task_id}: Cannot resume as agent is not initialized")
            raise HTTPException(status_code=400, detail="Cannot resume task, agent not initialized")
    except Exception as e:
        logger.error(f"Task {task_id}: Error resuming task: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to resume task: {str(e)}")

# NEW: Get current action endpoint
@api_router.get("/tasks/{task_id}/action", response_model=ActionDataResponse)
async def get_action_data(task_id: str):
    """Gets information about the current action waiting for approval."""
    if task_id not in active_tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task_state = active_tasks[task_id]
    agent = task_state["agent"]
    
    # Get current action data from agent
    action_data = await agent.get_current_step()  # Now includes next_goal if available
    
    if action_data is None:
        # No pending action
        return ActionDataResponse(pending_approval=False)
    
    # Check if this is action data (has an 'action' dictionary)
    if "action" in action_data and isinstance(action_data["action"], dict):
        return ActionDataResponse(
            pending_approval=True,
            action=action_data.get("action"),
            next_goal=action_data.get("next_goal"),  # Get directly from action_data
            index=action_data.get("index"),
            total=action_data.get("total"),
            url=action_data.get("url"),
            step_number=action_data.get("step_number")
        )
    
    # If it's just step data (perhaps older format or edge case)
    return ActionDataResponse(
        pending_approval=True,
        next_goal=action_data.get("next_goal"),  # Get directly from action_data
        url=action_data.get("url"),
        step_number=action_data.get("step_number")
    )

# NEW: Approve action endpoint
@api_router.post("/tasks/{task_id}/approve-action", response_model=ApprovalResponse)
async def approve_action(task_id: str):
    """Approves the current action, allowing the agent to proceed with this action."""
    if task_id not in active_tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task_state = active_tasks[task_id]
    agent = task_state["agent"]
    
    # Check if task is in a state that can be approved
    if task_state["status"] not in ["running"]:
        return ApprovalResponse(
            success=False,
            message=f"Task is in '{task_state['status']}' state and cannot be approved"
        )
    
    # Try to approve the action
    success = await agent.approve_action()
    
    if success:
        await _handle_event(task_id, {"type": "user_action", "message": "User approved the action"})
        return ApprovalResponse(success=True, message="Action approved successfully")
    else:
        return ApprovalResponse(success=False, message="No action is pending approval")

# NEW: Reject action endpoint
@api_router.post("/tasks/{task_id}/reject-action", response_model=ApprovalResponse)
async def reject_action(task_id: str):
    """Rejects the current action, causing the agent to pause."""
    if task_id not in active_tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task_state = active_tasks[task_id]
    agent = task_state["agent"]
    
    # Check if task is in a state that can be rejected
    if task_state["status"] not in ["running"]:
        return ApprovalResponse(
            success=False,
            message=f"Task is in '{task_state['status']}' state and cannot be rejected"
        )
    
    # Try to reject the action
    success = await agent.reject_action()
    
    if success:
        task_state["status"] = "paused"
        await _handle_event(task_id, {"type": "user_action", "message": "User rejected the action, agent paused"})
        return ApprovalResponse(success=True, message="Action rejected, agent paused")
    else:
        return ApprovalResponse(success=False, message="No action is pending approval") 