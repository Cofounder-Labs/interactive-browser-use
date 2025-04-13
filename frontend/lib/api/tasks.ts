/**
 * Creates a new task by calling the backend API.
 * @param description - The description of the task.
 * @returns The created task object.
 * @throws Will throw an error if the API call fails.
 */
export const createTask = async (description: string) => {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/tasks";
  console.log(`Creating task via: ${apiUrl}`);

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ description }),
  });

  if (!response.ok) {
    let errorDetail = `HTTP error! status: ${response.status}`;
    try {
      const errorData = await response.json();
      errorDetail = errorData.detail || errorDetail;
    } catch {
      // Ignore if response is not JSON
    }
    console.error("Create task API error:", errorDetail);
    throw new Error(errorDetail);
  }

  const createdTask = await response.json();
  return createdTask;
};

/**
 * Fetches the status of a specific task.
 * @param taskId - The ID of the task to fetch status for.
 * @returns The task status object.
 * @throws Will throw an error if the API call fails.
 */
export const fetchTaskStatus = async (taskId: string) => {
  const statusApiUrl = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/tasks"}/${taskId}/status`;
  // console.log(`Fetching status from: ${statusApiUrl}`); // Optional: log for debugging

  const response = await fetch(statusApiUrl);

  if (!response.ok) {
    const errorDetail = `Failed to fetch status: ${response.status}`;
    console.error(errorDetail);
    throw new Error(errorDetail);
  }

  const data = await response.json();
  return data;
};

// You can add more API functions here as needed, e.g., for approving, editing, canceling tasks. 

// --- Interfaces ---

export interface Task {
  id: string
  description: string
  status: string
}

// Interface for step/action data (combined for simplicity)
export interface StepData {
  pending_approval: boolean
  url?: string
  action?: Record<string, unknown>
  action_name?: string
  action_details?: Record<string, unknown>
  thought?: Record<string, unknown> // Agent's reasoning for the action
  screenshot?: string
  step_number?: number
  index?: number // Current action index
  total?: number // Total actions in current step
  next_goal?: string // High-level goal for the next action
  human_readable_description?: string // Description of the current action
}

// Interface for planner thoughts
export interface PlannerThought {
  timestamp: number
  content: {
    state_analysis: string
    progress_evaluation: string
    challenges: string
    next_steps: string[]
    reasoning: string
  }
  formatted_time: string
}

export interface PlannerThoughtsResponse {
  has_thoughts: boolean
  latest: PlannerThought | null
  all_thoughts: PlannerThought[]
  updated_since_last_fetch: boolean
}

// --- API Functions ---

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/tasks";

/**
 * Helper function to handle API errors.
 * @param response - The fetch response object.
 * @param context - A string describing the context of the API call for error messages.
 * @returns The parsed JSON data if successful.
 * @throws Will throw an error if the API call fails.
 */
const handleApiResponse = async (response: Response, context: string) => {
  if (!response.ok) {
    let errorDetail = `HTTP error! status: ${response.status} in ${context}`;
    try {
      const errorData = await response.json();
      errorDetail = errorData.detail || errorDetail;
    } catch {
      // Ignore if response is not JSON
    }
    console.error(`${context} API error:`, errorDetail);
    throw new Error(errorDetail);
  }
  // Return null for 204 No Content responses
  if (response.status === 204) {
    return null;
  }
  return response.json();
};

/**
 * Fetches the current action data for a task.
 * @param taskId - The ID of the task.
 * @returns The action data object.
 */
export const fetchActionData = async (taskId: string): Promise<StepData | null> => {
  const apiUrl = `${API_BASE_URL}/${taskId}/action`;
  try {
    const response = await fetch(apiUrl);
    // Action endpoint might return 204 if no action is ready
    if (response.status === 204) return null;
    return await handleApiResponse(response, "fetchActionData");
  } catch (error) {
    console.error("Fetch action data failed:", error);
    // Decide if you want to re-throw or return null/specific error object
    throw error;
  }
};

/**
 * Fetches the current step data for a task.
 * @param taskId - The ID of the task.
 * @returns The step data object.
 */
export const fetchStepData = async (taskId: string): Promise<StepData | null> => {
  const apiUrl = `${API_BASE_URL}/${taskId}/step`;
  try {
    const response = await fetch(apiUrl);
    // Step endpoint might return 204
    if (response.status === 204) return null;
    return await handleApiResponse(response, "fetchStepData");
  } catch (error) {
    console.error("Fetch step data failed:", error);
    throw error;
  }
};

/**
 * Fetches planner thoughts for a task.
 * @param taskId - The ID of the task.
 * @returns The planner thoughts response.
 */
export const fetchPlannerThoughts = async (taskId: string): Promise<PlannerThoughtsResponse> => {
  const apiUrl = `${API_BASE_URL}/${taskId}/planner-thoughts`;
  // console.log('Fetching planner thoughts from:', apiUrl);
  const response = await fetch(apiUrl);
  return handleApiResponse(response, "fetchPlannerThoughts");
};

/**
 * Marks planner thoughts as seen.
 * @param taskId - The ID of the task.
 */
export const markPlannerThoughtsSeen = async (taskId: string): Promise<void> => {
  const apiUrl = `${API_BASE_URL}/${taskId}/planner-thoughts/mark-seen`;
  try {
    const response = await fetch(apiUrl, { method: 'POST' });
    await handleApiResponse(response, "markPlannerThoughtsSeen");
  } catch (error) {
    console.error("Mark planner thoughts seen failed:", error);
    // Decide if you want to re-throw or handle silently
    throw error;
  }
};

/**
 * Resumes a paused task.
 * @param taskId - The ID of the task to resume.
 * @returns Updated task status information.
 */
export const resumeTask = async (taskId: string) => {
  const apiUrl = `${API_BASE_URL}/${taskId}/resume`;
  const response = await fetch(apiUrl, { method: 'POST' });
  return handleApiResponse(response, "resumeTask");
};

/**
 * Approves the pending action for a task.
 * @param taskId - The ID of the task.
 * @returns Response potentially containing next state or confirmation.
 */
export const approveAction = async (taskId: string) => {
  const apiUrl = `${API_BASE_URL}/${taskId}/approve-action`;
  const response = await fetch(apiUrl, { method: 'POST' });
  return handleApiResponse(response, "approveAction");
};

/**
 * Rejects the pending action for a task (pauses the task).
 * @param taskId - The ID of the task.
 * @returns Response potentially containing paused state or confirmation.
 */
export const rejectAction = async (taskId: string) => {
  const apiUrl = `${API_BASE_URL}/${taskId}/reject-action`;
  const response = await fetch(apiUrl, { method: 'POST' });
  return handleApiResponse(response, "rejectAction");
};

/**
 * Cancels the entire task goal.
 * @param taskId - The ID of the task to cancel.
 * @returns Confirmation or updated status.
 */
export const cancelGoal = async (taskId: string) => {
  const apiUrl = `${API_BASE_URL}/${taskId}/cancel`; // Assuming this endpoint exists
  console.log(`Canceling goal for task ${taskId} via: ${apiUrl}`);
  const response = await fetch(apiUrl, { method: 'POST' });
  return handleApiResponse(response, "cancelGoal");
};

// Add other API functions as needed (e.g., edit, plan)

// You can add more API functions here as needed, e.g., for approving, editing, canceling tasks. 