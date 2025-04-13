import os
import time
import subprocess
import requests
import platform # Import platform module
from typing import Optional
from browser_use import Browser, BrowserConfig

def _get_chrome_path() -> str:
    """Determine the path to Chrome/Chromium based on the OS."""
    system = platform.system()
    if system == "Darwin": # macOS
        return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    elif system == "Linux": # Linux (likely Docker)
        # Check standard paths for chromium
        for path in ["/usr/bin/chromium", "/usr/bin/chromium-browser"]:
            if os.path.exists(path):
                return path
        # Fallback or raise error if not found
        print("Warning: Chromium not found in standard paths /usr/bin/chromium or /usr/bin/chromium-browser")
        return "chromium" # Hope it's in PATH
    else:
        # Default or raise error for unsupported OS
        print(f"Warning: Unsupported OS detected: {system}. Attempting to use 'google-chrome' in PATH.")
        return "google-chrome"

def launch_chrome_with_debugging(port: int = 9222, app_port: int = 8000) -> bool:
    """Launch Chrome/Chromium with remote debugging enabled"""
    chrome_path = _get_chrome_path()
    if not os.path.exists(chrome_path) and platform.system() == "Darwin": # Only check existence strictly on Mac
        print(f"Chrome not found at {chrome_path}")
        return False
    
    # Check if Chrome/Chromium is already running with remote debugging
    try:
        response = requests.get(f'http://localhost:{port}/json/version')
        if response.status_code == 200:
            print("Chrome/Chromium is already running with remote debugging enabled")
            return True
    except requests.exceptions.ConnectionError as e:
        pass # Proceed with launch

    # Kill existing processes (be careful with this in containers)
    if platform.system() == "Darwin": # Only pkill on Mac for safety
        subprocess.run(['pkill', '-f', f'remote-debugging-port={port}'])
        time.sleep(1)
    
    # Base launch command
    launch_cmd = [
        chrome_path,
        f'--remote-debugging-port={port}',
        '--user-data-dir=/tmp/chrome-debug-profile' # Use /tmp for container compatibility
    ]
    
    # Add flags for Linux/Docker
    if platform.system() == "Linux":
        launch_cmd.extend([
            '--no-sandbox', # Often needed in Docker
            '--disable-gpu', # Still often needed
            '--disable-dev-shm-usage', # Overcomes limited resource problems
        ])
    else: # macOS specific - open the app URL
         launch_cmd.append(f'http://localhost:{app_port}')

    print(f"Launching browser with command: {' '.join(launch_cmd)}")
    try:
        subprocess.Popen(launch_cmd)
        time.sleep(3) # Increased wait time
        
        # Verify connection again after attempting launch
        response = requests.get(f'http://localhost:{port}/json/version')
        if response.status_code == 200:
            print("Launched new Chrome/Chromium instance with remote debugging enabled")
            return True
        else:
            print(f"Failed to connect to Chrome/Chromium on port {port} after launch attempt.")
            return False
    except Exception as e:
        print(f"Error launching browser: {e}")
        return False

def get_browser_instance(port: int = 9222) -> Optional[Browser]:
    """Get a browser instance connected to the debug Chrome/Chromium instance"""
    chrome_path = _get_chrome_path()
    extra_args = []
    # Add no_sandbox if on Linux (common in Docker)
    if platform.system() == "Linux":
        extra_args.append("--no-sandbox")

    try:
        browser_config = BrowserConfig(
            # browser_instance_path is deprecated alias, use browser_binary_path
            browser_binary_path=chrome_path, # Use dynamic path 
            headless=False, # Agent controls headless mode via CDP
            disable_security=True, # Often needed for cross-origin interactions
            cdp_url=f"http://127.0.0.1:{port}", # Explicitly use IPv4 loopback
            extra_browser_args=extra_args
        )
        
        browser = Browser(browser_config)
        browser.page = None # Initialize page attribute
        return browser
    except Exception as e:
        print(f"Error creating browser instance: {e}")
        return None 