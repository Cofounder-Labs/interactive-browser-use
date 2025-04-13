"""
Agent wrapper for browser-use library.
"""

from typing import Any, Callable, Dict, Optional, List
from browser_use import Agent
from langchain_openai import ChatOpenAI, AzureChatOpenAI
from rich.console import Console
from rich.logging import RichHandler
import logging
import os
import asyncio
from .utils.chrome import get_browser_instance

class BrowserAgent:
    """Wrapper class for browser-use functionality."""
    
    def __init__(self, task: str, on_event: Optional[Callable[[Dict[str, Any]], None]] = None):
        """
        Initialize the browser agent.
        
        Args:
            task: The natural language task description
            on_event: Optional callback function for agent events
        """
        self.task = task
        self.on_event = on_event
        self.agent = None
        self.browser = None
        self._setup_logging()
        self.paused = False
        self.pending_approval = False
        self.approved = False
        self.rejected = False
        self.current_step_data = {}
        self.step_approval_event = asyncio.Event()
        self.current_actions = {}
        self.current_action_index = 0
        self.action_approval_event = asyncio.Event()
        self.current_batch_next_goal: Optional[str] = None
        self.current_model_output = None  # Store the latest model output directly
        
    def _setup_logging(self):
        """Set up logging with rich formatting."""
        self.console = Console()
        
        # Set up logging for our agent
        self.logger = logging.getLogger("browser_agent")
        self.logger.setLevel(logging.DEBUG)
        
        # Set up logging for browser-use
        browser_use_logger = logging.getLogger("browser_use")
        browser_use_logger.setLevel(logging.DEBUG)
        
        # Add rich handler if not already added
        if not self.logger.handlers:
            handler = RichHandler(console=self.console, show_time=True, show_path=True)
            self.logger.addHandler(handler)
            browser_use_logger.addHandler(handler)
    
    def _handle_event(self, event: Dict[str, Any]):
        """Handle agent events and forward them to the callback if provided."""
        self.logger.debug(f"Agent event: {event}")
        if self.on_event:
            self.on_event(event)
    
    async def on_step_start(self, agent):
        """Handler for the on_step_start lifecycle hook"""
        self.logger.debug("Step start hook triggered")
        
        # Store the agent reference so we can use it in on_action_start
        self.current_agent = agent
        
        # We'll still capture the current state for step-level information
        current_page = await agent.browser_context.get_current_page()
        
        # Get model's thoughts and actions if available
        thoughts = agent.state.history.model_thoughts()
        latest_thought = thoughts[-1] if thoughts else None
        
        actions = agent.state.history.model_actions()
        latest_action = actions[-1] if actions else None
        
        urls = agent.state.history.urls()
        current_url = current_page.url if current_page else None
        
        # Store current step data
        self.current_step_data = {
            "url": current_url,
            "thought": latest_thought,
            "action": latest_action,
            "step_number": len(actions)
        }
        
        # We don't pause here anymore, we'll pause before each action
        # Just notify about the new step
        self._handle_event({
            "type": "step_started",
            "message": "Starting a new step",
            "data": self.current_step_data
        })
    
    async def on_action_start(self, action, index, total):
        """Handler for each individual action before it's executed"""
        self.logger.debug(f"Action start hook triggered for action {index+1}/{total}")
        
        if not hasattr(self, 'current_agent'):
            self.logger.error("No agent available for action hook")
            return
            
        # Get current page information
        current_page = await self.current_agent.browser_context.get_current_page()
        current_url = current_page.url if current_page else None
        
        # Extract the specific action name and details for cleaner display
        action_dict = action.dict()
        action_name, action_details = self.get_planned_action(action_dict)
        
        # Create action data with detailed information, including next_goal from model output
        action_data = {
            "action": action_dict,  # Full action for processing
            "action_name": action_name,  # Extracted action name for display
            "action_details": action_details,  # Extracted details for display
            "index": index + 1,
            "total": total,
            "url": current_url,
            "step_number": self.current_step_data.get("step_number"),
            "next_goal": self.current_batch_next_goal  # This comes from store_model_output
        }
        
        # Notify about pending action approval
        self.pending_approval = True
        self.current_action_index = index
        self.current_actions = action_data
        
        self._handle_event({
            "type": "action_approval_needed",
            "message": f"Agent is waiting for approval of action {index+1}/{total}",
            "data": action_data
        })
        
        # Reset approval event and wait for approval
        self.action_approval_event.clear()
        self.approved = False
        self.rejected = False
        
        # Wait for approval/rejection
        await self.action_approval_event.wait()
        
        # Check if approved or rejected
        if self.rejected:
            self.logger.debug("Action was rejected, pausing agent")
            # Ensure the underlying agent is paused if rejection occurs
            if hasattr(self, 'current_agent') and self.current_agent:
                self.current_agent.pause()
            self._handle_event({
                "type": "action_rejected",
                "message": "User rejected the action, agent paused"
            })
        else:
            self.logger.debug("Action was approved, executing")
            self._handle_event({
                "type": "action_approved",
                "message": "User approved the action"
            })
        
        self.pending_approval = False
    
    async def approve_action(self):
        """Approve the current action and allow the agent to execute it"""
        if not self.pending_approval:
            return False
        
        self.approved = True
        self.rejected = False
        self.action_approval_event.set()
        return True
    
    async def reject_action(self):
        """Reject the current action and pause the agent"""
        if not self.pending_approval:
            return False
        
        self.approved = False
        self.rejected = True
        self.action_approval_event.set()
        return True
    
    async def approve_step(self):
        """Legacy method for backward compatibility"""
        return await self.approve_action()
    
    async def reject_step(self):
        """Legacy method for backward compatibility"""
        return await self.reject_action()
    
    async def get_current_step(self):
        """Get data about the current step/action that is pending approval"""
        if not self.pending_approval:
            return None
        # Return the entire dictionary stored during on_action_start
        return self.current_actions
    
    async def store_model_output(self, model_output):
        """Stores the model output immediately after it's generated.
        This hook will be called right after get_next_action() returns."""
        self.logger.debug("Storing model output from get_next_action")
        self.current_model_output = model_output
        # We can directly access next_goal here from the current_state
        if model_output and hasattr(model_output, 'current_state'):
            self.current_batch_next_goal = model_output.current_state.next_goal
            self.logger.debug(f"Set next_goal directly from model output: {self.current_batch_next_goal}")
    
    def get_planned_action(self, action_data):
        """Extract the actual planned action name and details from action data."""
        if not action_data:
            return None, None
            
        for action_name, action_details in action_data.items():
            if action_details is not None:
                return action_name, action_details
        return None, None
    
    async def start(self):
        """Start the agent and execute the task."""
        try:
            self.logger.debug(f"Starting task: {self.task}")
            
            # Initialize the LLM (using OpenAI or Azure OpenAI)
            if os.getenv("AZURE_ENDPOINT") and os.getenv("AZURE_OPENAI_API_KEY"):
                self.logger.debug("Using Azure OpenAI")
                llm = AzureChatOpenAI(
                    azure_endpoint=os.getenv("AZURE_ENDPOINT"),
                    api_key=os.getenv("AZURE_OPENAI_API_KEY"),
                    api_version="2024-02-15-preview",
                    model="gpt-4o",
                    temperature=0
                )
            elif os.getenv("OPENAI_API_KEY"):
                self.logger.debug("Using OpenAI")
                llm = ChatOpenAI(
                    model="gpt-4o",
                    temperature=0,
                    openai_api_key=os.getenv("OPENAI_API_KEY")
                )
            else:
                raise ValueError("Either OPENAI_API_KEY or (AZURE_ENDPOINT and AZURE_OPENAI_API_KEY) environment variables are required")
            
            # Get browser instance (connects to the one launched at startup)
            self.browser = get_browser_instance()
            if not self.browser:
                # Log error more specifically
                self.logger.error("Failed to get browser instance. Ensure Chrome/Chromium is running with remote debugging.")
                raise RuntimeError("Failed to create browser instance")
            
            # Create a more specific task description
            specific_task = f"""
            {self.task}
            
            Instructions:
            1. Open a new tab in the browser
            2. In the new tab, navigate to Google's search page
            3. Enter the search term in the search box
            4. Click the search button
            5. Wait for results to load
            6. Stop when the search results are visible
            
            Important: Always perform actions in a new tab, never modify the current tab.
            Please complete this task step by step and stop when you see the search results.
            """
            
            # Create the agent with our custom multi_act wrapper
            self.agent = Agent(
                task=specific_task,
                llm=llm,
                use_vision=False,  # Disable vision to reduce complexity
                max_failures=2,    # Limit the number of retries
                browser=self.browser  # Use our pre-launched browser instance
            )
            
            # Create a hook for after get_next_action to store the model output
            original_get_next_action = self.agent.get_next_action
            
            async def wrapped_get_next_action(*args, **kwargs):
                # Call the original method
                result = await original_get_next_action(*args, **kwargs)
                # Store the result for our wrapper to use
                await self.store_model_output(result)
                return result
            
            # Replace the original get_next_action with our wrapped version
            self.agent.get_next_action = wrapped_get_next_action
            
            # Create a wrapper for the multi_act method to inject our action-by-action approval
            original_multi_act = self.agent.multi_act
            
            async def wrapped_multi_act(actions: List[Dict], *args, **kwargs):
                """
                Intercepts multi_act to implement action-by-action approval.
                The goal information is already captured from get_next_action wrapper.
                """
                results = []
                
                for i, action in enumerate(actions):
                    # Set the current agent context for on_action_start
                    self.current_agent = self.agent
                    
                    # Wait for approval of this specific action
                    await self.on_action_start(action, i, len(actions))
                    
                    # If rejected, stop processing this batch
                    if self.rejected:
                        self.logger.debug(f"Action {i+1}/{len(actions)} was rejected, stopping execution")
                        break
                    
                    # Execute just this one action with the original multi_act
                    single_result = await original_multi_act([action], *args, **kwargs)
                    
                    if single_result:
                        results.extend(single_result)
                        # If this action completed the task or errored, stop batch processing
                        if single_result[0].is_done or single_result[0].error:
                            break
                
                # Only clear goal if we've processed all actions in the batch or hit a terminal condition
                if i == len(actions) - 1 or self.rejected or (single_result and (single_result[0].is_done or single_result[0].error)):
                    # Clean up after batch is complete            
                    self.current_batch_next_goal = None  # Clear goal
                    self.current_model_output = None     # Clear model output
                return results
            
            # Replace the original multi_act with our simplified wrapper
            self.agent.multi_act = wrapped_multi_act
            
            self.logger.debug("Agent created, starting task execution...")
            
            try:
                # Set a timeout of 60 seconds for the task
                async with asyncio.timeout(60):
                    # Run the agent with both hooks
                    await self.agent.run(
                        on_step_start=self.on_step_start
                    )
                    self.logger.debug("Task completed successfully")
            except asyncio.TimeoutError:
                self.logger.error("Task timed out after 60 seconds")
                raise
            except Exception as e:
                self.logger.error(f"Error during task execution: {str(e)}")
                raise
            
        except Exception as e:
            self.logger.error(f"Error executing task: {str(e)}")
            raise
        finally:
            await self.stop()
    
    async def stop(self):
        """Stop the agent and clean up resources."""
        if self.agent:
            self.agent = None
            self.logger.debug("Agent stopped")
        
        # Don't close the browser instance as it's shared
        self.browser = None 