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
import time

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
        self.on_event = on_event or (lambda event: None)  # Default no-op event handler
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
        self.current_model_output = None
        # Add planner state tracking
        self.planner_thoughts = []
        self.latest_plan = None
        self.planner_updated = False
        self.current_step = None
        self.last_action_details = {}
        
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
                browser=self.browser,  # Use our pre-launched browser instance
                # planner_llm=llm,
                # planner_interval=4
            )
            
            # Hook into the planner to capture its output
            original_run_planner = self.agent._run_planner
            
            async def wrapped_run_planner(*args, **kwargs):
                # Log when planner is being called
                self.logger.info(f"🧠 Planner is being called at step {self.agent.state.n_steps if hasattr(self.agent, 'state') else 'unknown'}")
                start_time = time.time()
                
                # Call the original method
                plan = await original_run_planner(*args, **kwargs)
                
                # Calculate execution time
                execution_time = time.time() - start_time
                
                # Capture the plan if it exists
                if plan:
                    timestamp = time.time()
                    
                    # Try to parse the plan as structured data
                    try:
                        # Check if the plan is already in a structured format (dict)
                        if isinstance(plan, dict):
                            structured_plan = plan
                        else:
                            # Try to parse JSON from the plan text
                            import json
                            import re
                            
                            # Check if the text might be JSON formatted
                            if plan.strip().startswith('{') and plan.strip().endswith('}'):
                                try:
                                    structured_plan = json.loads(plan)
                                except json.JSONDecodeError:
                                    # Not valid JSON, try to parse it as structured text
                                    structured_plan = self._parse_planner_text(plan)
                            else:
                                # Parse as structured text
                                structured_plan = self._parse_planner_text(plan)
                            
                        # Ensure we have all required fields
                        required_fields = ["state_analysis", "progress_evaluation", "challenges", "next_steps", "reasoning"]
                        for field in required_fields:
                            if field not in structured_plan:
                                if field == "next_steps" and "next_steps" not in structured_plan:
                                    # Try to extract steps from text if missing
                                    structured_plan["next_steps"] = self._extract_steps(structured_plan.get("reasoning", ""))
                                else:
                                    structured_plan[field] = ""
                        
                        # Ensure next_steps is always a list
                        if not isinstance(structured_plan["next_steps"], list):
                            structured_plan["next_steps"] = [structured_plan["next_steps"]]
                            
                    except Exception as e:
                        self.logger.warning(f"Failed to parse planner output as structured data: {str(e)}")
                        # Fallback to unstructured format
                        structured_plan = {
                            "state_analysis": "",
                            "progress_evaluation": "Task in progress",
                            "challenges": "",
                            "next_steps": [plan],
                            "reasoning": plan
                        }
                        
                    plan_data = {
                        "timestamp": timestamp,
                        "content": structured_plan,
                        "formatted_time": time.strftime("%H:%M:%S", time.localtime(timestamp))
                    }
                    self.latest_plan = plan_data
                    self.planner_thoughts.append(plan_data)
                    self.planner_updated = True
                    
                    # Log the plan content and execution time
                    self.logger.info(f"🧠 Planner generated thoughts in {execution_time:.2f}s")
                    self.logger.info(f"🧠 Plan content: {str(structured_plan)[:200]}..." if len(str(structured_plan)) > 200 else f"🧠 Plan content: {structured_plan}")
                    
                    # Notify about the new plan
                    self._handle_event({
                        "type": "planner_updated",
                        "message": "Planner has generated new thoughts",
                        "data": plan_data
                    })
                else:
                    self.logger.warning("🧠 Planner was called but returned no plan")
                
                return plan
            
            # Replace the original planner method with our wrapped version
            self.agent._run_planner = wrapped_run_planner
            
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
                
                # Wait for approval only for the first action in the batch
                # This gives a single approval per goal, not per action
                if actions:
                    # Set the current agent context for on_action_start
                    self.current_agent = self.agent
                    
                    # Wait for approval of only the first action
                    # We'll use this as approval for the entire batch
                    await self.on_action_start(actions[0], 0, len(actions))
                    
                    # If rejected, don't process any actions in this batch
                    if self.rejected:
                        self.logger.debug(f"Batch of {len(actions)} actions was rejected, stopping execution")
                        return []
                
                # If approved, execute all actions in sequence without further approvals
                for i, action in enumerate(actions):
                    # Execute action with the original multi_act
                    single_result = await original_multi_act([action], *args, **kwargs)
                    
                    if single_result:
                        results.extend(single_result)
                        # If this action completed the task or errored, stop batch processing
                        if single_result[0].is_done or single_result[0].error:
                            break
                
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

    # New method to get planner thoughts
    async def get_planner_thoughts(self):
        """Get the latest planner thoughts and all previous thoughts."""
        if not self.planner_thoughts:
            return {
                "has_thoughts": False,
                "latest": None,
                "all_thoughts": []
            }
        
        return {
            "has_thoughts": True,
            "latest": self.latest_plan,
            "all_thoughts": self.planner_thoughts,
            "updated_since_last_fetch": self.planner_updated
        }
        
    # Reset the planner updated flag after fetching
    async def mark_planner_thoughts_seen(self):
        """Mark planner thoughts as seen so clients can track updates."""
        self.planner_updated = False
        return {"success": True}

    def _parse_planner_text(self, text):
        """Parse planner text output into structured format."""
        import re
        
        # Initialize the structured plan
        structured_plan = {
            "state_analysis": "",
            "progress_evaluation": "",
            "challenges": "",
            "next_steps": [],
            "reasoning": ""
        }
        
        # Define patterns to look for each section
        patterns = {
            "state_analysis": r"(?:state analysis|current state):(.*?)(?=progress|evaluation|challenges|next steps|reasoning|\Z)",
            "progress_evaluation": r"(?:progress|evaluation):(.*?)(?=state|challenges|next steps|reasoning|\Z)",
            "challenges": r"challenges:(.*?)(?=state|progress|evaluation|next steps|reasoning|\Z)",
            "next_steps": r"next steps:(.*?)(?=state|progress|evaluation|challenges|reasoning|\Z)",
            "reasoning": r"reasoning:(.*?)(?=state|progress|evaluation|challenges|next steps|\Z)"
        }
        
        # Extract each section using the patterns
        for key, pattern in patterns.items():
            match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
            if match:
                content = match.group(1).strip()
                
                # For next_steps, split into a list of steps
                if key == "next_steps":
                    steps = self._extract_steps(content)
                    structured_plan[key] = steps
                else:
                    structured_plan[key] = content
                    
        # If we couldn't extract anything meaningful, use the whole text as reasoning
        if not any(structured_plan.values()):
            structured_plan["reasoning"] = text.strip()
            structured_plan["next_steps"] = self._extract_steps(text)
            
        return structured_plan

    def _extract_steps(self, text):
        """Extract steps from text, either numbered or bullet points."""
        import re
        
        # Try to find numbered steps or bullet points
        step_patterns = [
            r"\d+\.\s*(.*?)(?=\d+\.|$)",  # Numbered steps like "1. Step one"
            r"[-*•]\s*(.*?)(?=[-*•]|$)",  # Bullet points like "- Step one" or "• Step one"
            r"Step \d+:\s*(.*?)(?=Step \d+:|$)"  # "Step 1: Do something"
        ]
        
        for pattern in step_patterns:
            steps = re.findall(pattern, text, re.DOTALL)
            if steps:
                return [step.strip() for step in steps if step.strip()]
        
        # If no clear steps found, try to split by newlines
        lines = [line.strip() for line in text.split('\n') if line.strip()]
        if len(lines) > 1:
            return lines
        
        # Fallback: just return the whole text as a single step
        return [text.strip()] if text.strip() else [] 