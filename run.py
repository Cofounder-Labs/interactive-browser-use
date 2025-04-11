#!/usr/bin/env python
"""
Run script for the browser agent application.
"""

import os
import subprocess
import sys
from pathlib import Path
from dotenv import load_dotenv

def check_env_vars():
    """Check if required environment variables are set."""
    # Load environment variables from .env file
    load_dotenv()
    
    # Check for either OpenAI or Azure OpenAI credentials
    has_openai = bool(os.getenv("OPENAI_API_KEY"))
    has_azure = bool(os.getenv("AZURE_ENDPOINT") and os.getenv("AZURE_OPENAI_API_KEY"))
    
    if not (has_openai or has_azure):
        print("Error: Either OPENAI_API_KEY or (AZURE_ENDPOINT and AZURE_OPENAI_API_KEY) environment variables are required")
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