"""
Tests for the browser agent wrapper.
"""

import pytest
from browser_agent.agent import BrowserAgent

@pytest.mark.asyncio
async def test_agent_initialization():
    """Test that the agent initializes correctly."""
    task = "Search for 'test' on Google"
    agent = BrowserAgent(task)
    assert agent.task == task
    assert agent.agent is None

@pytest.mark.asyncio
async def test_agent_event_handling():
    """Test that events are handled correctly."""
    events = []
    
    def on_event(event):
        events.append(event)
    
    task = "Search for 'test' on Google"
    agent = BrowserAgent(task, on_event=on_event)
    
    # Simulate an event
    test_event = {"type": "navigation", "url": "https://www.google.com"}
    agent._handle_event(test_event)
    
    assert len(events) == 1
    assert events[0] == test_event 