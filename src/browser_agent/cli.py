"""
Command-line interface for the browser agent.
"""

import asyncio
import click
import os
from rich.console import Console
from rich.panel import Panel
from .agent import BrowserAgent

console = Console()

@click.group()
def cli():
    """Interactive Browser-Use Agent CLI."""
    pass

@cli.command()
@click.argument('task', type=str)
def run(task: str):
    """Run a browser automation task."""
    try:
        # Check for required environment variables
        if not os.getenv("OPENAI_API_KEY"):
            console.print("[red]Error: OPENAI_API_KEY environment variable is required[/red]")
            raise click.Abort()

        console.print(Panel.fit(
            f"Starting task: {task}",
            title="Browser Agent",
            border_style="blue"
        ))
        
        agent = BrowserAgent(task)
        
        # Create a new event loop for the async operation
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            loop.run_until_complete(agent.start())
        finally:
            loop.close()
        
    except Exception as e:
        console.print(f"[red]Error: {str(e)}[/red]")
        raise click.Abort()

@cli.command()
def version():
    """Show the version of the browser agent."""
    from . import __version__
    console.print(f"Browser Agent version: {__version__}")

if __name__ == '__main__':
    cli() 