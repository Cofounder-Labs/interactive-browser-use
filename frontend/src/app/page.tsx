'use client'; // Add this directive for client-side interactivity (useState)

import { useState } from 'react';
import Image from 'next/image'; // Import Image component if needed for logo

export default function Home() {
  // State to manage which view is active
  const [activeTask, setActiveTask] = useState<any>(null); // Use a more specific type if available
  const [taskDescription, setTaskDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false); // Add loading state
  const [error, setError] = useState<string | null>(null); // Add error state

  // Function to handle task creation via API
  const handleCreateTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!taskDescription || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('http://localhost:8000/api/tasks', { // Assuming backend runs on port 8000
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ description: taskDescription }),
      });

      if (!response.ok) {
        // Try to get error details from response
        let errorDetail = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          errorDetail = errorData.detail || errorDetail;
        } catch (jsonError) {
          // Ignore if response is not JSON
        }
        throw new Error(errorDetail);
      }

      const createdTask = await response.json();

      // Update state to show the task status view
      setActiveTask({
        id: createdTask.task_id,
        description: createdTask.description,
        status: createdTask.status, // Use status from backend
      });
      // Optionally clear description
      // setTaskDescription(''); 

    } catch (err: any) {
      console.error('Failed to create task:', err);
      setError(err.message || 'Failed to start task. Please check backend connection.');
      setActiveTask(null); // Stay on the entry view if error occurs
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-purple-50 p-4"> {/* Added padding */}
      <div className="w-full max-w-lg">
        {!activeTask ? (
          // Initial Task Entry View
          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="flex items-center justify-center mb-8">
              {/* Replace with your actual SVG or Image component */}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="h-6 w-6 mr-2" fill="#a855f7">
                 <path d="M50 10 C 77.61 10 100 32.39 100 60 C 100 87.61 77.61 110 50 110 C 22.39 110 0 87.61 0 60 C 0 32.39 22.39 10 50 10 Z M 50 20 C 33.43 20 20 33.43 20 50 C 20 66.57 33.43 80 50 80 C 66.57 80 80 66.57 80 50 C 80 33.43 66.57 20 50 20 Z M 50 30 C 61.05 30 70 38.95 70 50 C 70 61.05 61.05 70 50 70 C 38.95 70 30 61.05 30 50 C 30 38.95 38.95 30 50 30 Z" />
              </svg>
              <h1 className="text-xl font-semibold text-gray-700">Interactive Browser-Use</h1>
            </div>
            <h2 className="text-lg font-medium text-gray-600 mb-4 text-left">What would you like to do today?</h2>
            <form onSubmit={handleCreateTask}>
              <input
                type="text"
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500 mb-5 text-sm text-gray-500"
                placeholder="e.g., 'Find and download my latest invoice from Stripe'"
                required
                disabled={isLoading} // Disable input while loading
              />
              {error && (
                <p className="text-red-500 text-sm mb-4">Error: {error}</p> // Display error message
              )}
              <button
                type="submit"
                className={`w-auto bg-purple-500 text-white px-6 py-2 rounded-md hover:bg-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 text-sm font-medium ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={isLoading} // Disable button while loading
              >
                {isLoading ? 'Starting...' : 'Start'} {/* Show loading text */}
              </button>
            </form>
          </div>
        ) : (
          // Task Status View
          <div className="space-y-6 w-full max-w-3xl"> {/* Increased max-width for this view */} 
            {/* Top Status Bar */}
            <div className="bg-white rounded-lg shadow-md p-4 flex justify-between items-center">
              <div className="flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="h-6 w-6 mr-2" fill="#a855f7">
                   <path d="M50 10 C 77.61 10 100 32.39 100 60 C 100 87.61 77.61 110 50 110 C 22.39 110 0 87.61 0 60 C 0 32.39 22.39 10 50 10 Z M 50 20 C 33.43 20 20 33.43 20 50 C 20 66.57 33.43 80 50 80 C 66.57 80 80 66.57 80 50 C 80 33.43 66.57 20 50 20 Z M 50 30 C 61.05 30 70 38.95 70 50 C 70 61.05 61.05 70 50 70 C 38.95 70 30 61.05 30 50 C 30 38.95 38.95 30 50 30 Z" />
                 </svg>
                <span className="font-medium text-gray-700">Goal:</span>
                <span className="ml-2 text-gray-600 truncate">{activeTask.description}</span>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-500">Status: Ready to Act</span> {/* Placeholder */}
                <span className="text-sm text-gray-500">|</span>
                <span className="text-sm text-gray-500">Progress: Step 1/2</span> {/* Placeholder */}
                <button className="text-gray-400 hover:text-gray-600 text-xl">⌄</button>
              </div>
            </div>

            {/* Browser Window Mockup */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden"> {/* Added overflow-hidden */}
              {/* Browser Tab Bar */}
              <div className="flex items-center px-4 py-2 border-b border-gray-200 bg-gray-50"> {/* Light bg for tab bar */}
                <div className="flex space-x-1.5 mr-4">
                  <span className="block h-3 w-3 bg-red-400 rounded-full"></span>
                  <span className="block h-3 w-3 bg-yellow-400 rounded-full"></span>
                  <span className="block h-3 w-3 bg-green-400 rounded-full"></span>
                </div>
                <div className="flex-grow bg-gray-200 rounded-md px-4 py-1 text-sm text-gray-600 text-center"> {/* Adjusted tab style */}
                  New Tab
                </div>
              </div>
              {/* Browser Content Area */}
              <div className="h-96 flex items-center justify-center text-center text-gray-400 p-8 bg-white"> {/* Ensure white bg */}
                <div>
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
                     <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                   </svg>
                   Waiting for action approval...
                 </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="bg-white rounded-lg shadow-md p-4 flex items-center justify-between">
              <div>
                <span className="font-semibold text-gray-700">Next Action:</span>
                 <span className="ml-2 text-gray-600">Unable to generate a plan for this goal. Starting by visiting the Stripe website</span> {/* Placeholder */}
              </div>
              <div className="flex space-x-3">
                <button className="bg-purple-600 text-white px-4 py-1.5 rounded-md text-sm hover:bg-purple-700 flex items-center focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Approve
                </button>
                <button className="bg-gray-200 text-gray-700 px-4 py-1.5 rounded-md text-sm hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2">Back to Plan</button>
                <button className="bg-gray-200 text-gray-700 px-4 py-1.5 rounded-md text-sm hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2">Edit Action</button>
                <button className="bg-gray-200 text-gray-700 px-4 py-1.5 rounded-md text-sm hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2">Change Goal</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
