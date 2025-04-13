"""
Agent wrapper for browser-use library.
"""

from typing import Any, Callable, Dict, Optional
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
        
        # Capture the current state of the agent
        current_page = await agent.browser_context.get_current_page()
        screenshot = await agent.browser_context.take_screenshot()
        
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
            "screenshot": screenshot,
            "step_number": len(actions)
        }
        
        # Notify about pending approval
        self.pending_approval = True
        self._handle_event({
            "type": "approval_needed",
            "message": "Agent is waiting for action approval",
            "data": self.current_step_data
        })
        
        # Reset approval event and wait for approval
        self.step_approval_event.clear()
        self.approved = False
        self.rejected = False
        
        # Wait for approval/rejection
        await self.step_approval_event.wait()
        
        # Check if approved or rejected
        if self.rejected:
            self.logger.debug("Step was rejected, pausing agent")
            agent.pause()
            self._handle_event({
                "type": "step_rejected",
                "message": "User rejected the step, agent paused"
            })
        else:
            self.logger.debug("Step was approved, continuing execution")
            self._handle_event({
                "type": "step_approved",
                "message": "User approved the step"
            })
        
        self.pending_approval = False
    
    async def approve_step(self):
        """Approve the current step and allow the agent to continue"""
        if not self.pending_approval:
            return False
        
        self.approved = True
        self.rejected = False
        self.step_approval_event.set()
        return True
    
    async def reject_step(self):
        """Reject the current step and pause the agent"""
        if not self.pending_approval:
            return False
        
        self.approved = False
        self.rejected = True
        self.step_approval_event.set()
        return True
    
    async def get_current_step(self):
        """Get data about the current step that is pending approval"""
        if not self.pending_approval:
            return None
        return self.current_step_data
    
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
                    model="gpt-4",
                    temperature=0
                )
            elif os.getenv("OPENAI_API_KEY"):
                self.logger.debug("Using OpenAI")
                llm = ChatOpenAI(
                    model="gpt-4",
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
            
            # Create and run the agent with timeout and additional configuration
            self.agent = Agent(
                task=specific_task,
                llm=llm,
                use_vision=False,  # Disable vision to reduce complexity
                max_failures=2,    # Limit the number of retries
                browser=self.browser  # Use our pre-launched browser instance
            )
            
            self.logger.debug("Agent created, starting task execution...")
            
            try:
                # Set a timeout of 60 seconds for the task
                async with asyncio.timeout(600):
                    # Run the agent with the step approval hook
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