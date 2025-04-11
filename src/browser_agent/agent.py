"""
Agent wrapper for browser-use library.
"""

from typing import Any, Callable, Dict, Optional
from browser_use import Agent
from langchain_openai import ChatOpenAI
from rich.console import Console
from rich.logging import RichHandler
import logging
import os
import asyncio
from .utils.chrome import launch_chrome_with_debugging, get_browser_instance

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
    
    async def start(self):
        """Start the agent and execute the task."""
        try:
            self.logger.debug(f"Starting task: {self.task}")
            
            # Initialize the LLM (using OpenAI)
            if not os.getenv("OPENAI_API_KEY"):
                raise ValueError("OPENAI_API_KEY environment variable is required")
            
            llm = ChatOpenAI(
                model="gpt-4",
                temperature=0,
                openai_api_key=os.getenv("OPENAI_API_KEY")
            )
            
            # Launch Chrome with debugging if not already running
            if not launch_chrome_with_debugging():
                raise RuntimeError("Failed to launch Chrome with debugging enabled")
            
            # Get browser instance
            self.browser = get_browser_instance()
            if not self.browser:
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
                async with asyncio.timeout(60):
                    await self.agent.run()
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