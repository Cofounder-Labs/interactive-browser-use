"""
Screenshot utility for browser agent.
"""

import os
import base64
from datetime import datetime
from pathlib import Path
from typing import Optional, Tuple
from browser_use import Browser

class ScreenshotManager:
    """Manages screenshot capture, storage, and cleanup."""
    
    def __init__(self, storage_dir: str = "screenshots"):
        """
        Initialize the screenshot manager.
        
        Args:
            storage_dir: Directory to store screenshots
        """
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        
    async def capture_screenshot(self, browser: Browser, task_id: str) -> Tuple[str, str]:
        """
        Capture a screenshot from the browser.
        
        Args:
            browser: Browser instance
            task_id: ID of the task
            
        Returns:
            Tuple of (screenshot_path, base64_encoded_image)
        """
        try:
            # Capture screenshot as base64
            screenshot_data = await browser.page.screenshot()
            base64_image = base64.b64encode(screenshot_data).decode('utf-8')
            
            # Generate filename with timestamp
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"{task_id}_{timestamp}.png"
            filepath = self.storage_dir / filename
            
            # Save the screenshot
            with open(filepath, 'wb') as f:
                f.write(screenshot_data)
                
            return str(filepath), base64_image
            
        except Exception as e:
            raise RuntimeError(f"Failed to capture screenshot: {str(e)}")
            
    def cleanup_screenshots(self, task_id: Optional[str] = None, max_age_days: int = 7):
        """
        Clean up old screenshots.
        
        Args:
            task_id: Optional task ID to clean up specific task screenshots
            max_age_days: Maximum age of screenshots to keep in days
        """
        try:
            current_time = datetime.now()
            
            for file in self.storage_dir.glob("*.png"):
                # Check if file matches task_id if specified
                if task_id and task_id not in file.name:
                    continue
                    
                # Check file age
                file_time = datetime.fromtimestamp(file.stat().st_mtime)
                age_days = (current_time - file_time).days
                
                if age_days > max_age_days:
                    file.unlink()
                    
        except Exception as e:
            raise RuntimeError(f"Failed to clean up screenshots: {str(e)}")
            
    def get_screenshot_path(self, task_id: str) -> Optional[str]:
        """
        Get the most recent screenshot path for a task.
        
        Args:
            task_id: ID of the task
            
        Returns:
            Path to the most recent screenshot or None if not found
        """
        try:
            # Find all screenshots for the task
            screenshots = list(self.storage_dir.glob(f"{task_id}_*.png"))
            if not screenshots:
                return None
                
            # Return the most recent one
            return str(max(screenshots, key=lambda x: x.stat().st_mtime))
            
        except Exception as e:
            raise RuntimeError(f"Failed to get screenshot path: {str(e)}") 