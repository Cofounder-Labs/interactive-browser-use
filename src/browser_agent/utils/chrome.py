import os
import time
import subprocess
import requests
from typing import Optional
from browser_use import Browser, BrowserConfig

def launch_chrome_with_debugging(port: int = 9222, app_port: int = 8000) -> bool:
    """Launch Chrome with remote debugging enabled"""
    chrome_path = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    if not os.path.exists(chrome_path):
        print(f"Chrome not found at {chrome_path}")
        return False
    
    # Check if Chrome is already running with remote debugging
    try:
        response = requests.get(f'http://localhost:{port}/json/version')
        if response.status_code == 200:
            print("Chrome is already running with remote debugging enabled")
            return True
    except requests.exceptions.ConnectionError:
        # Chrome is not running with remote debugging, proceed with launch
        pass
    
    # Kill any existing Chrome processes with remote debugging
    subprocess.run(['pkill', '-f', f'remote-debugging-port={port}'])
    time.sleep(1)  # Wait for processes to be killed
    
    # Launch Chrome with remote debugging and open the application URL
    subprocess.Popen([
        chrome_path,
        f'--remote-debugging-port={port}',
        '--user-data-dir=/tmp/chrome-debug-profile',
        f'http://localhost:{app_port}'  # Open the application URL
    ])
    time.sleep(2)  # Wait for Chrome to start
    print("Launched new Chrome instance with remote debugging enabled")
    return True

def get_browser_instance(port: int = 9222) -> Optional[Browser]:
    """Get a browser instance connected to the debug Chrome instance"""
    try:
        # Initialize browser with remote debugging
        browser = Browser(
            BrowserConfig(
                chrome_instance_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                headless=False,
                disable_security=True,
                cdp_url=f"http://localhost:{port}"
            )
        )
        
        # Initialize page property
        browser.page = None
        return browser
    except Exception as e:
        print(f"Error creating browser instance: {e}")
        return None 