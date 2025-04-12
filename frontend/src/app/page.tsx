'use client'; // Add this directive for client-side interactivity (useState)

import React, { useState } from 'react';
import dynamic from 'next/dynamic'; // Import dynamic

// Dynamically import VncScreen only on the client side
const VncScreen = dynamic(
  () => import('react-vnc').then(mod => mod.VncScreen), // Adjust if VncScreen is default export
  {
    ssr: false, // Disable server-side rendering for this component
    loading: () => <p className="text-white p-4">Loading VNC Viewer...</p> // Optional loading indicator
  }
);

// Define an interface for the task state
interface Task {
  id: string;
  description: string;
  status: string;
}

export default function Home() {
  // State to manage which view is active
  const [activeTask, setActiveTask] = useState<Task | null>(null); // Use Task interface
  const [taskDescription, setTaskDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false); // Add loading state
  const [error, setError] = useState<string | null>(null); // Add error state
  const [showVnc, setShowVnc] = useState(false); // State to control VNC visibility

  // Function to handle task creation via API
  const handleCreateTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!taskDescription || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      // Use environment variable for API URL
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/tasks'; 
      console.log(`Sending request to: ${apiUrl}`); // Add log for debugging

      const response = await fetch(apiUrl, { 
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
        } catch { // Removed unused variable declaration
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
      setShowVnc(true); // Show VNC viewer when task is active

    } catch (err: unknown) { // Use unknown for caught error
      console.error('Failed to create task:', err);
      let errorMessage = 'Failed to start task. Please check backend connection.';
      if (err instanceof Error) {
        errorMessage = err.message; // Use error message if it's an Error instance
      }
      setError(errorMessage);
      setActiveTask(null); // Stay on the entry view if error occurs
      setShowVnc(false); // Hide VNC on error
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-purple-50 p-4"> {/* Added padding */}
      <div className={`w-full ${activeTask ? 'max-w-5xl' : 'max-w-lg'}`}> {/* Wider layout for VNC */}
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
          // Task Status View with VNC
          <div className="space-y-6">
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

            {/* Browser View Area (placeholder or VNC) */}
            <div className="bg-gray-700 rounded-lg shadow-md overflow-hidden h-[600px] w-full flex items-center justify-center relative">
               {/* Conditionally render VNC based on showVnc */}
               {showVnc && (
                 <VncScreen
                   url={'ws://localhost:5901'} // VNC WebSocket URL (ensure docker-compose exposes 5900)
                   scaleViewport
                   background="#000000"
                   style={{
                     width: '100%',
                     height: '100%',
                   }}
                   // Optional props: 
                   // debug={true}
                   // onConnect={() => console.log('VNC Connected')}
                   // onDisconnect={() => console.log('VNC Disconnected')}
                   // onError={(err) => console.error('VNC Error:', err)}
                 />
               )}
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
