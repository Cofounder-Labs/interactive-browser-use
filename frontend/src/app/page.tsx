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

// Define interfaces for the step data
interface StepData {
  pending_approval: boolean;
  url?: string;
  action?: Record<string, unknown>;
  action_name?: string;
  action_details?: Record<string, unknown>;
  thought?: Record<string, unknown>;
  screenshot?: string;
  step_number?: number;
  index?: number;
  total?: number;
  next_goal?: string;
  human_readable_description?: string;
}

// Define interfaces for the action data
interface ActionData {
  pending_approval: boolean;
  action?: Record<string, unknown>;
  action_name?: string;
  action_details?: Record<string, unknown>;
  next_goal?: string;
  index?: number;
  total?: number;
  url?: string;
  step_number?: number;
  human_readable_description?: string;
}

// Define interfaces for planner thoughts
interface PlannerThought {
  timestamp: number;
  content: {
    state_analysis: string;
    progress_evaluation: string;
    challenges: string;
    next_steps: string[];
    reasoning: string;
  };
  formatted_time: string;
}

interface PlannerThoughtsResponse {
  has_thoughts: boolean;
  latest: PlannerThought | null;
  all_thoughts: PlannerThought[];
  updated_since_last_fetch: boolean;
}

export default function Home() {
  // State to manage which view is active
  const [activeTask, setActiveTask] = useState<Task | null>(null); // Use Task interface
  const [taskDescription, setTaskDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false); // Add loading state
  const [error, setError] = useState<string | null>(null); // Add error state
  const [showVnc, setShowVnc] = useState(true); // State to control VNC visibility, default to true when task is active
  
  // New state for step approval
  const [currentStep, setCurrentStep] = useState<StepData | null>(null);
  const [stepLoading, setStepLoading] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  
  // New state for planner thoughts
  const [latestThought, setLatestThought] = useState<PlannerThought | null>(null);
  const [newThoughtReceived, setNewThoughtReceived] = useState(false);
  const [displayedSteps, setDisplayedSteps] = useState<string[]>([]);

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

  // Combined polling logic for both step and action data
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // intentionally omitting currentStep to prevent feedback loop
  useEffect(() => {
    let pollingIntervalId: NodeJS.Timeout | null = null;
    
    const fetchAgentData = async () => {
      if (!activeTask || activeTask.status.toLowerCase() !== 'running') return;

      try {
        // Poll the action endpoint first (prioritize action data when available)
        const actionApiUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/tasks'}/${activeTask.id}/action`;
        const actionResponse = await fetch(actionApiUrl);

        if (actionResponse.ok) {
          const actionData: ActionData = await actionResponse.json();
          
          // More targeted state update - only set if data has actually changed
          if (actionData.pending_approval) {
            // If we have an action needing approval, always update
            setCurrentStep(prevStep => {
              // Deep comparison to avoid setting state if nothing meaningful changed
              if (!prevStep || 
                  prevStep.pending_approval !== actionData.pending_approval ||
                  prevStep.next_goal !== actionData.next_goal ||
                  prevStep.action_name !== actionData.action_name ||
                  JSON.stringify(prevStep.action_details) !== JSON.stringify(actionData.action_details)) {
                return actionData as StepData;
              }
              return prevStep;
            });
            
            // Set faster polling only once when we detect pending approval
            if (pollingIntervalId) {
              clearInterval(pollingIntervalId);
              pollingIntervalId = setInterval(fetchAgentData, 1000); // Poll every second while waiting for approval
            }
            
            // If we have pending approval, no need to check step data
            return;
          } else if (!currentStep) {
            // If no current step but action data exists, use it
            setCurrentStep(actionData as StepData);
          }
          
          // Slow down polling if we have action data but no pending approval
          if (!actionData.pending_approval && pollingIntervalId) {
            clearInterval(pollingIntervalId);
            pollingIntervalId = setInterval(fetchAgentData, 3000); // Slower polling when no approval needed
          }
        } else {
          console.error(`Failed to fetch action data: ${actionResponse.status}`);
        }

        // Only fetch step data if action data wasn't available or didn't have pending approval
        const stepApiUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/tasks'}/${activeTask.id}/step`;
        const stepResponse = await fetch(stepApiUrl);

        if (stepResponse.ok) {
          const stepData: StepData = await stepResponse.json();
          
          // Only update if there's pending approval or no current step yet
          if (stepData.pending_approval) {
            setCurrentStep(prevStep => {
              // Only update if something actually changed
              if (!prevStep || prevStep.pending_approval !== stepData.pending_approval) {
                return stepData;
              }
              return prevStep;
            });
            
            // If step is pending approval, poll more frequently
            if (pollingIntervalId) {
              clearInterval(pollingIntervalId);
              pollingIntervalId = setInterval(fetchAgentData, 1000);
            }
          } else if (!currentStep) {
            setCurrentStep(stepData);
          }
        } else {
          console.error(`Failed to fetch step data: ${stepResponse.status}`);
        }
      } catch (err) {
        console.error('Error fetching agent data:', err);
        setStepError('Failed to fetch agent information');
      }
    };

    if (activeTask && activeTask.status.toLowerCase() === 'running') {
      fetchAgentData(); // Fetch immediately
      pollingIntervalId = setInterval(fetchAgentData, 3000); // Start with slower polling by default
      console.log('Started combined polling for agent data');
    } else {
      // Only clear step data if task is not running
      setCurrentStep(null);
    }

    return () => {
      if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
        console.log('Agent data polling stopped');
      }
    };
  }, [activeTask]); // Intentionally omitting currentStep to prevent feedback loop

  // Update the planner thoughts polling function
  useEffect(() => {
    let plannerPollingId: NodeJS.Timeout | null = null;
    
    const fetchPlannerThoughts = async () => {
      if (!activeTask) return;
      
      try {
        const plannerApiUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/tasks'}/${activeTask.id}/planner-thoughts`;
        console.log('Fetching planner thoughts from:', plannerApiUrl);
        const response = await fetch(plannerApiUrl);
        
        if (!response.ok) {
          console.error(`Failed to fetch planner thoughts: ${response.status}`);
          return;
        }
        
        const data: PlannerThoughtsResponse = await response.json();
        console.log('Planner thoughts response:', data);
        
        // Only keep track of the latest thought
        if (data.latest && (!latestThought || data.latest.timestamp !== latestThought.timestamp)) {
          setLatestThought(data.latest);
          setNewThoughtReceived(true);
          
          // Reset the streaming state for new thought
          setDisplayedSteps([]);
          
          // Start the streaming effect for next steps only
          streamNextSteps(data.latest.content.next_steps);
          
          // Mark as seen
          const markSeenUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/tasks'}/${activeTask.id}/planner-thoughts/mark-seen`;
          await fetch(markSeenUrl, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
        }
      } catch (err) {
        console.error('Error fetching planner thoughts:', err);
      }
    };
    
    // Function to simulate streaming effect for next steps
    const streamNextSteps = (steps: string[]) => {
      if (!steps || steps.length === 0) return;
      
      // Filter out empty steps
      const filteredSteps = steps.filter(step => step.trim().length > 0);
      if (filteredSteps.length === 0) return;
      
      let currentStepIndex = 0;
      
      const stepInterval = setInterval(() => {
        if (currentStepIndex < filteredSteps.length) {
          setDisplayedSteps(prev => [...prev, filteredSteps[currentStepIndex]]);
          currentStepIndex++;
        } else {
          clearInterval(stepInterval);
          // After all steps displayed, clear new thought indicator after delay
          setTimeout(() => setNewThoughtReceived(false), 3000);
        }
      }, 800); // Stream a new step every 800ms
      
      return () => clearInterval(stepInterval);
    };
    
    if (activeTask) {
      fetchPlannerThoughts(); // Fetch immediately
      plannerPollingId = setInterval(fetchPlannerThoughts, 3000); // Poll every 3 seconds
      console.log('Started polling for planner thoughts');
    }
    
    return () => {
      if (plannerPollingId) {
        clearInterval(plannerPollingId);
        console.log('Planner thoughts polling stopped');
      }
    };
  }, [activeTask, latestThought]);

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

  // New function to resume a paused task
  const handleResumeTask = async () => {
    if (!activeTask || activeTask.status.toLowerCase() !== 'paused') return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const apiUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/tasks'}/${activeTask.id}/resume`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to resume task: ${response.status}`);
      }
      
      // Update task status
      const data = await response.json();
      setActiveTask(prev => prev ? {...prev, status: data.status} : null);
      
    } catch (err) {
      console.error('Error resuming task:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to resume task';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // New function to handle action approval
  const handleApproveAction = async () => {
    if (!activeTask || !currentStep?.pending_approval) return;
    
    setStepLoading(true);
    setStepError(null);
    
    try {
      const apiUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/tasks'}/${activeTask.id}/approve-action`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to approve action: ${response.status}`);
      }
      
      // We'll get updated action state from polling
      
    } catch (err) {
      console.error('Error approving action:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to approve action';
      setStepError(errorMessage);
    } finally {
      setStepLoading(false);
    }
  };
  
  // New function to handle action rejection
  const handleRejectAction = async () => {
    if (!activeTask || !currentStep?.pending_approval) return;
    
    setStepLoading(true);
    setStepError(null);
    
    try {
      const apiUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/tasks'}/${activeTask.id}/reject-action`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to reject action: ${response.status}`);
      }
      
      // Update active task status to paused
      setActiveTask(prev => prev ? {...prev, status: 'paused'} : null);
      // Clear current step
      setCurrentStep(null);
      
    } catch (err) {
      console.error('Error rejecting action:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to reject action';
      setStepError(errorMessage);
    } finally {
      setStepLoading(false);
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
    } else if (status === 'stopped' || status === 'paused') {
      return 'bg-gray-100 text-gray-800'; // Style for stopped/paused
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

  // Helper function to check if task is paused
  const isPaused = (status: string): boolean => {
    return status.toLowerCase() === 'paused';
  };

  // Function to reset to the initial task entry view
  const handleStartNewTask = () => {
    setActiveTask(null);
    setTaskDescription(''); // Optionally clear previous description
    setError(null); // Clear any previous errors
    setShowVnc(false); // Hide VNC when returning to start
    setCurrentStep(null); // Clear step data
  };

  // Replace the existing Planner Thoughts Box with the updated version
  const PlannerThoughtsBox = () => (
    <div className="bg-white rounded-lg shadow-lg p-4 transition-all duration-300">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center">
          <svg className="h-5 w-5 text-blue-600 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd" transform="rotate(180 10 10)"></path>
          </svg>
          <h3 className="font-semibold text-gray-800">Planner Module</h3>
        </div>
        {newThoughtReceived && (
          <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full animate-pulse">
            New thoughts
          </span>
        )}
      </div>
      
      {latestThought ? (
        <div className="space-y-4">
          {/* Progress */}
          <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
            <div className="text-xs font-semibold text-gray-500 mb-1">Progress</div>
            <div className="text-sm text-gray-700">{latestThought.content.progress_evaluation}</div>
          </div>
          
          {/* Next Steps Section */}
          <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
            <div className="text-xs font-semibold text-blue-700 mb-2">Next Steps</div>
            <div className="space-y-2">
              {displayedSteps.map((step, idx) => (
                <div key={idx} className="flex items-start">
                  <span className="flex-shrink-0 h-5 w-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs mr-2">{idx + 1}</span>
                  <span className="text-sm text-gray-700">{step}</span>
                </div>
              ))}
              {displayedSteps.length < (latestThought.content.next_steps?.filter(step => step.trim().length > 0).length || 0) && (
                <div className="flex items-center">
                  <div className="ml-7 h-4 w-4 relative">
                    <div className="animate-ping absolute h-4 w-4 rounded-full bg-blue-400 opacity-75"></div>
                    <div className="relative rounded-full h-3 w-3 bg-blue-500"></div>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <div className="text-xs text-right text-gray-400">{latestThought.formatted_time}</div>
        </div>
      ) : (
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-center">
          <p className="text-gray-500">No planner thoughts available yet</p>
        </div>
      )}
    </div>
  );

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-indigo-100 p-4">
      <div className={`transition-all duration-300 ease-in-out w-full ${activeTask ? 'max-w-6xl' : 'max-w-xl'}`}> {/* Dynamic width */}
        {!activeTask ? (
          // Initial Task Entry View
          <div className="bg-white rounded-xl shadow-xl p-8 md:p-10">
            <div className="flex items-center justify-center mb-8">
              {/* Replace with your actual SVG or Image component - simplified */}
              <svg className="h-8 w-8 text-purple-600 mr-3" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd"></path></svg>
              <h1 className="text-2xl font-bold text-gray-800">Interactive Browser Use</h1>
            </div>
            <h2 className="text-lg font-semibold text-gray-700 mb-5 text-center">What task should be performed?</h2>
            <form onSubmit={handleCreateTask}>
              <textarea
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 mb-5 text-base text-gray-700 resize-none shadow-sm" // Use textarea for potentially longer inputs
                placeholder="Describe the goal, e.g., &apos;Log into my bank account and download the statement for last month&apos;"
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
                {/* Display action counter if available */}
                <span className="text-sm text-gray-500 hidden sm:inline">
                  {currentStep?.index && currentStep?.total ? 
                    `Action ${currentStep.index}/${currentStep.total}` : 
                    (currentStep?.step_number ? `Step ${currentStep.step_number}` : 'Starting...')}
                </span>
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

            {/* Replace the planner thoughts section with the new component */}
            <PlannerThoughtsBox />

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
              ) : activeTask && isPaused(activeTask.status) ? (
                // Paused State: Show Resume button
                <div className="w-full flex justify-center">
                  <button 
                    onClick={handleResumeTask}
                    className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 text-base font-medium transition duration-200 ease-in-out"
                    disabled={isLoading}
                  >
                    {isLoading ? 'Resuming...' : 'Resume Task'}
                  </button>
                </div>
              ) : (
                // Active/Ongoing State: Show approval buttons when step is pending
                <>
                  {currentStep?.pending_approval ? (
                    // Show notification banner when approval is needed
                    <div className="w-full bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4 rounded">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div className="ml-3">
                          <p className="text-sm text-yellow-700">
                            <span className="font-bold">Awaiting your approval:</span> The agent is waiting for you to approve or reject the next action before continuing.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    // Show processing indicator when agent is thinking
                    <div className="w-full bg-blue-50 border-l-4 border-blue-400 p-4 mb-4 rounded">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <svg className="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        </div>
                        <div className="ml-3">
                          <p className="text-sm text-blue-700">
                            <span className="font-medium">Processing:</span> The agent is analyzing the page and determining the next action...
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="flex-grow">
                    {/* High-level goal display section */}
                    <div className="flex flex-col mb-4">
                      <span className="font-semibold text-gray-800 mb-1">Current Goal:</span>
                      <span className="text-gray-700 bg-green-50 p-2 rounded">
                        {currentStep?.next_goal ? 
                          currentStep.next_goal : 
                          'Waiting for agent to set a goal...'}
                      </span>
                    </div>
                    
                    {/* Next action display section */}
                    <div className="flex flex-col">
                      <span className="font-semibold text-gray-800 mb-1">Next Action:</span>
                      <span className="text-gray-700 bg-gray-50 p-2 rounded">
                        {currentStep?.human_readable_description ? 
                          currentStep.human_readable_description :
                          (currentStep?.action_name ? 
                            `${currentStep.action_name}: ${JSON.stringify(currentStep.action_details)}` :
                            (currentStep?.action ? 
                              JSON.stringify(currentStep.action).substring(0, 100) + (JSON.stringify(currentStep.action).length > 100 ? '...' : '') : 
                              'Waiting for agent...'))}
                      </span>
                    </div>
                  </div>
                  <div className="flex space-x-2 flex-wrap gap-2 md:gap-0 md:flex-nowrap">
                    {currentStep?.pending_approval ? (
                      // Only show approval buttons when action is pending approval
                      <>
                        <button 
                          onClick={handleApproveAction}
                          disabled={stepLoading}
                          className={`bg-green-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-green-700 flex items-center focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition duration-150 ease-in-out ${stepLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          {stepLoading ? 'Processing...' : 'Approve'}
                        </button>
                        <button 
                          onClick={handleRejectAction}
                          disabled={stepLoading}
                          className={`bg-red-500 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition duration-150 ease-in-out ${stepLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {stepLoading ? 'Processing...' : 'Reject'}
                        </button>
                      </>
                    ) : (
                      // Show a disabled placeholder button when no action is pending
                      <button 
                        disabled
                        className="bg-gray-200 text-gray-500 px-4 py-2 rounded-md text-sm font-medium cursor-not-allowed"
                      >
                        Waiting for action...
                      </button>
                    )}
                    <button 
                      onClick={() => {}} // Placeholder for cancel task
                      className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 transition duration-150 ease-in-out"
                    >
                      Cancel Goal
                    </button>
                  </div>
                </>
              )}
              {stepError && (
                <p className="text-red-600 text-sm p-2 bg-red-50 rounded-md w-full">{stepError}</p>
              )}
            </div>
            
            {/* Display step thought details when available */}
            {currentStep?.thought && currentStep.pending_approval && (
              <div className="bg-white rounded-lg shadow-lg p-4">
                <div className="flex items-center mb-2">
                  <svg className="h-5 w-5 text-purple-500 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd" transform="rotate(180 10 10)"></path>
                  </svg>
                  <h3 className="font-semibold text-gray-800">Agent&apos;s Thoughts:</h3>
                </div>
                <div className="bg-gray-50 p-3 rounded-md text-sm text-gray-700 max-h-40 overflow-y-auto">
                  <pre className="whitespace-pre-wrap font-mono text-xs">
                    {JSON.stringify(currentStep.thought, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
