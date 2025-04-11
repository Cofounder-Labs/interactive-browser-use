"""Script to run the FastAPI web server."""
import os
import uvicorn
from pathlib import Path

from browser_agent.web.app import app

def main():
    """Run the FastAPI web server."""
    # Ensure static directory exists
    static_dir = Path(__file__).parent / "static"
    static_dir.mkdir(exist_ok=True)

    # Run server
    uvicorn.run(
        "browser_agent.web.app:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )

if __name__ == "__main__":
    main() 