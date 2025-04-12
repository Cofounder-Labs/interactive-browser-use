'use client'; // Add this directive for client-side interactivity (useState)

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic'; // Import dynamic

// Dynamically import VncScreen only on the client side
const VncScreen = dynamic(
  () => import('react-vnc').then(mod => mod.VncScreen), // Adjust if VncScreen is default export
  {
    ssr: false, // Disable server-side rendering for this component
    loading: () => <p className="text-white p-4 text-center">Loading VNC Viewer...</p> // Optional loading indicator
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
  const [showVnc, setShowVnc] = useState(true); // State to control VNC visibility, default to true when task is active

  // --- Status Polling Logic --- 
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    const fetchStatus = async () => {
      if (!activeTask) return;

      try {
        // Assume endpoint exists: /api/tasks/{taskId}/status
        const statusApiUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/tasks'}/${activeTask.id}/status`;
        const response = await fetch(statusApiUrl);

        if (!response.ok) {
          // Handle errors potentially, maybe set an error state or stop polling
          console.error(`Failed to fetch status: ${response.status}`);
          // Optionally stop polling on error:
          // if (intervalId) clearInterval(intervalId);
          return; 
        }

        const data = await response.json();
        const newStatus = data.status; // Assuming the backend returns { status: "..." }

        setActiveTask(prevTask => {
          if (prevTask && prevTask.id === activeTask.id && prevTask.status !== newStatus) {
            return { ...prevTask, status: newStatus };
          }
          return prevTask;
        });

        // Stop polling if task is complete or failed
        const lowerCaseStatus = newStatus.toLowerCase();
        if (lowerCaseStatus === 'complete' || lowerCaseStatus === 'completed' || lowerCaseStatus === 'failed' || lowerCaseStatus === 'error') {
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null; // Clear the reference
            console.log('Polling stopped due to final status:', newStatus);
          }
        }

      } catch (err) {
        console.error('Error fetching task status:', err);
        // Optionally stop polling on fetch error:
        // if (intervalId) clearInterval(intervalId);
      }
    };

    if (activeTask) {
      // Fetch status immediately and then start polling
      fetchStatus(); 
      intervalId = setInterval(fetchStatus, 3000); // Poll every 3 seconds
      console.log('Started polling for task status:', activeTask.id);
    }

    // Cleanup function: clear interval when component unmounts or activeTask changes
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
        console.log('Polling stopped.');
      }
    };
  }, [activeTask]); // Re-run effect if activeTask changes

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
        } catch {
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
      setShowVnc(true); // Ensure VNC is shown initially when task is active

    } catch (err: unknown) {
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

  const toggleVnc = () => {
    setShowVnc(!showVnc);
  };

  // Helper function to determine status badge styling
  const getStatusBadgeClass = (status: string) => {
    status = status.toLowerCase();
    if (status === 'complete' || status === 'completed') {
      return 'bg-green-100 text-green-800';
    } else if (status === 'failed' || status === 'error') {
      return 'bg-red-100 text-red-800';
    } else if (status === 'in-progress' || status === 'running' || status === 'active') {
      return 'bg-yellow-100 text-yellow-800';
    } else if (status === 'stopped') {
      return 'bg-gray-100 text-gray-800'; // Style for stopped
    } else {
      return 'bg-blue-100 text-blue-800'; // Default (e.g., created, pending)
    }
  };

  // Helper function to check for terminal statuses
  const isTerminalStatus = (status: string): boolean => {
    const lowerCaseStatus = status.toLowerCase();
    return [
      'complete',
      'completed',
      'failed',
      'error',
      'stopped'
    ].includes(lowerCaseStatus);
  };

  // Function to reset to the initial task entry view
  const handleStartNewTask = () => {
    setActiveTask(null);
    setTaskDescription(''); // Optionally clear previous description
    setError(null); // Clear any previous errors
    setShowVnc(false); // Hide VNC when returning to start
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-indigo-100 p-4">
      <div className={`transition-all duration-300 ease-in-out w-full ${activeTask ? 'max-w-6xl' : 'max-w-xl'}`}> {/* Dynamic width */}
        {!activeTask ? (
          // Initial Task Entry View
          <div className="bg-white rounded-xl shadow-xl p-8 md:p-10">
            <div className="flex items-center justify-center mb-8">
              {/* Replace with your actual SVG or Image component - simplified */}
              <svg className="h-8 w-8 text-purple-600 mr-3" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd"></path></svg>
              <h1 className="text-2xl font-bold text-gray-800">Interactive Browser Session</h1>
            </div>
            <h2 className="text-lg font-semibold text-gray-700 mb-5 text-center">What task should be performed?</h2>
            <form onSubmit={handleCreateTask}>
              <textarea
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 mb-5 text-base text-gray-700 resize-none shadow-sm" // Use textarea for potentially longer inputs
                placeholder="Describe the goal, e.g., 'Log into my bank account and download the statement for last month'"
                rows={3} // Adjust rows as needed
                required
                disabled={isLoading}
              />
              {error && (
                <p className="text-red-600 text-sm mb-4 p-3 bg-red-50 rounded-md"><strong>Error:</strong> {error}</p> // Enhanced error display
              )}
              <button
                type="submit"
                className={`w-full bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 text-lg font-semibold transition duration-200 ease-in-out ${isLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
                disabled={isLoading}
              >
                {isLoading ? 'Starting Session...' : 'Start Session'}
              </button>
            </form>
          </div>
        ) : (
          // Task Status View with VNC
          <div className="space-y-5">
            {/* Top Status Bar */}
            <div className="bg-white rounded-lg shadow-lg p-4 flex flex-wrap justify-between items-center gap-4">
              <div className="flex items-center flex-grow min-w-0">
                <span className="font-semibold text-gray-800 mr-2">Goal:</span>
                <span className="text-gray-700 truncate flex-shrink" title={activeTask.description}>{activeTask.description}</span>
              </div>
              <div className="flex items-center space-x-4 flex-shrink-0">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(activeTask.status)}`}>
                  Status: {activeTask.status}
                </span>
                 <span className="text-sm text-gray-500 hidden sm:inline">|</span>
                 <span className="text-sm text-gray-500 hidden sm:inline">Step 1/5</span> {/* Placeholder - Consider updating this too if backend provides step info */}
                {/* VNC Toggle Button */}
                <button
                    onClick={toggleVnc}
                    className="bg-gray-200 text-gray-700 px-3 py-1 rounded-md text-xs font-medium hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
                  >
                    {showVnc ? 'Hide Browser' : 'Show Browser'}
                </button>
              </div>
            </div>

            {/* Browser View Area (Conditional VNC) */}
            <div className={`bg-gray-800 rounded-lg shadow-lg overflow-hidden transition-all duration-500 ease-in-out ${showVnc ? 'h-[600px] opacity-100' : 'h-0 opacity-0'} w-full flex items-center justify-center relative`}>
               {/* VNC Screen is rendered conditionally based on visibility and existence */}
               {showVnc && (
                 <VncScreen
                   url={'ws://localhost:5901'} // VNC WebSocket URL
                   scaleViewport
                   background="#1f2937" // Darker background matching the container
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

            {/* Action Bar - Conditionally Rendered */}
            <div className="bg-white rounded-lg shadow-lg p-4 flex flex-col md:flex-row items-center justify-between gap-4">
              {activeTask && isTerminalStatus(activeTask.status) ? (
                // Terminal State: Show 'Start New Task' button
                <div className="w-full flex justify-center">
                    <button 
                      onClick={handleStartNewTask}
                      className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 text-base font-medium transition duration-200 ease-in-out"
                    >
                      Start New Task
                    </button>
                </div>
              ) : (
                // Active/Ongoing State: Show standard action buttons
                <>
                  <div className="flex-grow">
                    <span className="font-semibold text-gray-800 mr-2">Next Action:</span>
                    <span className="text-gray-700">Navigating to Stripe login page...</span> {/* Placeholder */}
                  </div>
                  <div className="flex space-x-2 flex-wrap gap-2 md:gap-0 md:flex-nowrap">
                    <button className="bg-green-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-green-700 flex items-center focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition duration-150 ease-in-out">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      Approve
                    </button>
                    <button className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 transition duration-150 ease-in-out">Plan</button>
                    <button className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 transition duration-150 ease-in-out">Edit</button>
                    <button className="bg-red-500 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition duration-150 ease-in-out">Cancel Goal</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
