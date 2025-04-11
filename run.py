#!/usr/bin/env python
"""
Run script for the browser agent application.
"""

import os
import subprocess
import sys
from pathlib import Path

def check_env_vars():
    """Check if required environment variables are set."""
    required_vars = ["OPENAI_API_KEY"]
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    
    if missing_vars:
        print("Error: The following environment variables are required but not set:")
        for var in missing_vars:
            print(f"  - {var}")
        print("\nPlease set these variables and try again.")
        sys.exit(1)

def main():
    """Main entry point for the application."""
    # Check environment variables
    check_env_vars()
    
    # Set default values for optional variables
    os.environ.setdefault("CHROME_DEBUG_PORT", "9222")
    os.environ.setdefault("APP_PORT", "8000")
    
    # Get the path to the web app
    web_app_path = Path(__file__).parent / "src" / "browser_agent" / "web" / "app.py"
    
    if not web_app_path.exists():
        print(f"Error: Could not find web application at {web_app_path}")
        sys.exit(1)
    
    # Run the FastAPI server
    try:
        subprocess.run([
            "poetry", "run", "uvicorn",
            "browser_agent.web.app:app",
            "--reload",
            "--host", "0.0.0.0",
            "--port", os.getenv("APP_PORT", "8000")
        ], check=True)
    except subprocess.CalledProcessError as e:
        print(f"Error running the server: {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\nServer stopped by user")
        sys.exit(0)

if __name__ == "__main__":
    main() 