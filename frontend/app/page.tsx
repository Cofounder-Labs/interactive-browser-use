"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import dynamic from "next/dynamic"
import {
  CheckCircle2,
  CircleX,
  Loader2,
  MonitorPlay,
  MonitorX,
  RotateCcw,
  ThumbsUp,
  Pencil,
  BrainCircuit,
  XCircle,
  AlertTriangle,
  Check,
  Play,
  Info,
  MessageSquare
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

// Import the new API functions
import {
  createTask,
  fetchTaskStatus,
  fetchActionData,
  fetchStepData,
  fetchPlannerThoughts,
  markPlannerThoughtsSeen,
  resumeTask,
  approveAction,
  rejectAction,
  cancelGoal,
  type Task,
  type StepData,
  type PlannerThought,
  type PlannerThoughtsResponse
} from "@/lib/api/tasks"

// Dynamically import VncScreen only on the client side
const VncScreen = dynamic(() => import("react-vnc").then((mod) => mod.VncScreen), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center w-full h-full bg-muted/30 rounded-lg">
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading VNC Viewer...</p>
      </div>
    </div>
  ),
})

export default function Home() {
  // State to manage which view is active
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [taskDescription, setTaskDescription] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showVnc, setShowVnc] = useState(true)

  // New state for step approval
  const [currentStep, setCurrentStep] = useState<StepData | null>(null);
  const [stepLoading, setStepLoading] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  // New state for planner thoughts
  const [latestThought, setLatestThought] = useState<PlannerThought | null>(null);
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const typewriterIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // --- Status Polling Logic ---
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null

    const fetchStatus = async () => {
      if (!activeTask) return

      try {
        // Use the imported fetchTaskStatus function
        const data = await fetchTaskStatus(activeTask.id)
        const newStatus = data.status

        setActiveTask((prevTask) => {
          if (prevTask && prevTask.id === activeTask.id && prevTask.status !== newStatus) {
            if (newStatus.toLowerCase() !== 'running') {
              setCurrentStep(null);
              setLatestThought(null);
            }
            return { ...prevTask, status: newStatus }
          }
          return prevTask
        })

        // Stop polling if task is complete or failed
        const lowerCaseStatus = newStatus.toLowerCase()
        if (
          isTerminalStatus(lowerCaseStatus) || isPaused(lowerCaseStatus)
        ) {
          if (intervalId) {
            clearInterval(intervalId)
            intervalId = null
            console.log("Status polling stopped due to final/paused status:", newStatus)
          }
        }
      } catch (err) {
        console.error("Error fetching task status:", err)
      }
    }

    if (activeTask && !isTerminalStatus(activeTask.status) && !isPaused(activeTask.status)) {
      fetchStatus()
      intervalId = setInterval(fetchStatus, 3000)
      console.log("Started polling for task status:", activeTask.id)
    } else if (intervalId) {
        clearInterval(intervalId);
        console.log("Status polling stopped.");
    }

    // Cleanup function: clear interval when component unmounts or activeTask changes
    return () => {
      if (intervalId) {
        clearInterval(intervalId)
        console.log("Status polling stopped.")
      }
    }
  }, [activeTask])

  // Combined polling logic for step/action data
  useEffect(() => {
    let pollingIntervalId: NodeJS.Timeout | null = null;
    let isFetching = false;

    const fetchAgentData = async () => {
      if (!activeTask || activeTask.status.toLowerCase() !== 'running' || isFetching) return;
      isFetching = true;

      let nextPollInterval = 3000;

      try {
        setStepError(null);
        const actionData = await fetchActionData(activeTask.id);

        if (actionData) {
          if (actionData.pending_approval) {
            setCurrentStep(prevStep => {
              if (!prevStep || prevStep.pending_approval !== actionData.pending_approval || prevStep.action_name !== actionData.action_name) {
                return actionData;
              }
              return prevStep;
            });
            nextPollInterval = 1000;
            isFetching = false;
            return;
          }
          setCurrentStep(actionData);
        } else {
            setCurrentStep(prev => prev?.pending_approval ? null : prev);
        }
      } catch (err) {
        console.error('Error fetching agent data:', err);
      } finally {
        isFetching = false;
        if (pollingIntervalId) clearInterval(pollingIntervalId);
        if (activeTask && activeTask.status.toLowerCase() === 'running') {
            pollingIntervalId = setTimeout(fetchAgentData, nextPollInterval);
        }
      }
    };

    if (activeTask && activeTask.status.toLowerCase() === 'running') {
      fetchAgentData();
      console.log('Started polling for agent data');
    } else {
       setCurrentStep(null);
    }

    return () => {
      if (pollingIntervalId) {
        clearTimeout(pollingIntervalId);
        console.log('Agent data polling stopped');
      }
    };
  }, [activeTask]);

  // --- Planner Thoughts Polling --- Typewriter Effect --- 
  const startTypewriterEffect = (steps: string[]) => {
      if (typewriterIntervalRef.current) {
          clearInterval(typewriterIntervalRef.current);
          typewriterIntervalRef.current = null;
      }
      if (!steps || steps.length === 0) {
          setIsTyping(false);
          setDisplayedText("(No specific steps outlined)");
          return;
      }

      const filteredSteps = steps.filter(step => step && step.trim().length > 0);
      if (filteredSteps.length === 0) {
          setIsTyping(false);
          setDisplayedText("(No specific steps outlined)");
          return;
      }

      const fullText = filteredSteps.join('\n\n');
      let currentPosition = 0;
      const charsPerFrame = 2;
      setDisplayedText("");
      setIsTyping(true);

      typewriterIntervalRef.current = setInterval(() => {
          if (currentPosition < fullText.length) {
              const nextChars = fullText.substring(currentPosition, currentPosition + charsPerFrame);
              setDisplayedText(prev => prev + nextChars);
              currentPosition += charsPerFrame;
          } else {
              if (typewriterIntervalRef.current) clearInterval(typewriterIntervalRef.current);
              typewriterIntervalRef.current = null;
              setIsTyping(false);
          }
      }, 25);
  };

  useEffect(() => {
    let plannerPollingId: NodeJS.Timeout | null = null;
    let isFetchingThoughts = false;

    const fetchThoughts = async () => {
        if (!activeTask || activeTask.status.toLowerCase() !== 'running' || isFetchingThoughts) return;
        isFetchingThoughts = true;

        try {
            const data: PlannerThoughtsResponse = await fetchPlannerThoughts(activeTask.id);

            if (data.latest && (!latestThought || data.latest.timestamp !== latestThought.timestamp)) {
                console.log('New planner thought received:', data.latest);
                setLatestThought(data.latest);
                startTypewriterEffect(data.latest.content.next_steps);

                markPlannerThoughtsSeen(activeTask.id).catch(err => console.error("Failed to mark thoughts seen:", err));
            }
        } catch (err) {
            console.error('Error fetching planner thoughts:', err);
        } finally {
            isFetchingThoughts = false;
        }
    };

    if (activeTask && activeTask.status.toLowerCase() === 'running') {
      fetchThoughts();
      plannerPollingId = setInterval(fetchThoughts, 5000);
      console.log('Started polling for planner thoughts');
    }

    return () => {
      if (plannerPollingId) {
        clearInterval(plannerPollingId);
        console.log('Planner thoughts polling stopped');
      }
      if (typewriterIntervalRef.current) {
          clearInterval(typewriterIntervalRef.current);
      }
    };
  }, [activeTask, latestThought]);

  // --- Handler Functions ---

  const handleCreateTask = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!taskDescription || isLoading) return

    setIsLoading(true)
    setError(null)
    setCurrentStep(null);
    setLatestThought(null);
    setDisplayedText("");

    try {
      const createdTask = await createTask(taskDescription)

      setActiveTask({
        id: createdTask.task_id,
        description: createdTask.description,
        status: createdTask.status,
      })
      setShowVnc(true)
    } catch (err: unknown) {
      console.error("Failed to create task:", err)
      let errorMessage = "Failed to start task. Please check backend connection."
      if (err instanceof Error) {
        errorMessage = err.message
      }
      setError(errorMessage)
      setActiveTask(null)
      setShowVnc(false)
    } finally {
      setIsLoading(false)
    }
  }

  const handleResumeTask = async () => {
    if (!activeTask || !isPaused(activeTask.status) || isLoading) return;

    setIsLoading(true);
    setError(null);
    setStepError(null);

    try {
      const data = await resumeTask(activeTask.id);
      setActiveTask(prev => prev ? {...prev, status: data.status || 'running'} : null);
      console.log('Task resumed');
    } catch (err) {
      console.error('Error resuming task:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to resume task';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproveAction = async () => {
    if (!activeTask || !currentStep?.pending_approval || stepLoading) return;

    setStepLoading(true);
    setStepError(null);

    try {
      await approveAction(activeTask.id);
      console.log('Action approved');
      setCurrentStep(prev => prev ? {...prev, pending_approval: false, thought: undefined } : null);

    } catch (err) {
      console.error('Error approving action:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to approve action';
      setStepError(errorMessage);
    } finally {
      setStepLoading(false);
    }
  };

  const handleRejectAction = async () => {
    if (!activeTask || !currentStep?.pending_approval || stepLoading) return;

    setStepLoading(true);
    setStepError(null);

    try {
      const data = await rejectAction(activeTask.id);
      console.log('Action rejected');
      setActiveTask(prev => prev ? {...prev, status: data?.status || 'paused'} : null);
      setCurrentStep(null);
      setLatestThought(null);
    } catch (err) {
      console.error('Error rejecting action:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to reject action';
      setStepError(errorMessage);
    } finally {
      setStepLoading(false);
    }
  };

  const handleCancelGoal = async () => {
    if (!activeTask || isLoading || stepLoading || isTerminalStatus(activeTask.status)) return;

    setStepLoading(true);
    setStepError(null);
    setError(null);

    try {
      const data = await cancelGoal(activeTask.id);
      console.log('Goal cancelled');
      setActiveTask(prev => prev ? {...prev, status: data?.status || 'stopped'} : null);
      setCurrentStep(null);
      setLatestThought(null);
      setShowVnc(false);
    } catch (err) {
      console.error('Error cancelling goal:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to cancel goal';
      setError(errorMessage);
    } finally {
      setStepLoading(false);
    }
  };

  const toggleVnc = () => {
    setShowVnc(!showVnc)
  }

  // --- Helper Functions & UI Components ---

  const getStatusBadge = (status: string) => {
    status = status.toLowerCase()

    if (status === "complete" || status === "completed") {
      return (
        <Badge variant="success" className="gap-1">
          <CheckCircle2 className="h-3 w-3" /> Completed
        </Badge>
      )
    } else if (status === "failed" || status === "error") {
      return (
        <Badge variant="destructive" className="gap-1">
          <CircleX className="h-3 w-3" /> Failed
        </Badge>
      )
    } else if (status === "in-progress" || status === "running" || status === "active") {
      return (
        <Badge variant="default" className="gap-1 bg-blue-500 hover:bg-blue-600">
          <Loader2 className="h-3 w-3 animate-spin" /> Running
        </Badge>
      )
    } else if (status === "stopped") {
      return (
        <Badge variant="outline" className="gap-1">
          <XCircle className="h-3 w-3" /> Stopped
        </Badge>
      )
    } else if (status === "paused") {
        return (
          <Badge variant="secondary" className="gap-1 bg-yellow-500 hover:bg-yellow-600">
            <CircleX className="h-3 w-3" /> Paused
          </Badge>
        )
    } else {
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="h-3 w-3" /> {status.charAt(0).toUpperCase() + status.slice(1)}
        </Badge>
      )
    }
  }

  const isTerminalStatus = (status: string): boolean => {
    const lowerCaseStatus = status.toLowerCase()
    return ["complete", "completed", "failed", "error", "stopped"].includes(lowerCaseStatus)
  }

  const isPaused = (status: string): boolean => {
    return status.toLowerCase() === 'paused';
  };

  const handleStartNewTask = () => {
    setActiveTask(null)
    setTaskDescription("")
    setError(null)
    setShowVnc(false)
    setCurrentStep(null)
    setLatestThought(null);
    setDisplayedText("");
    setStepError(null);
    if (typewriterIntervalRef.current) clearInterval(typewriterIntervalRef.current);
  }

  const PlannerThoughtsBox = () => {
    const isTaskActive = activeTask && activeTask.status.toLowerCase() === 'running';

    if (!isTaskActive || !latestThought) return null;

    return (
      <Card className="transition-all duration-300">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
             <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-blue-600" />
                <CardTitle className="text-lg">Planner Module</CardTitle>
             </div>
             {isTyping && (
               <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
           <div className="bg-muted/50 p-3 rounded-md border">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Progress</p>
              <p className="text-sm text-foreground">{latestThought.content.progress_evaluation || "Evaluating..."}</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded-md border border-blue-200 dark:border-blue-800">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-2">Next Steps</p>
              <div className="text-sm text-foreground whitespace-pre-wrap min-h-[40px]">
                {displayedText}
                {isTyping && (
                  <span className="inline-block w-2 h-4 bg-blue-700 dark:bg-blue-300 ml-1 animate-pulse align-bottom"></span>
                )}
              </div>
            </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background/90 to-background/80 p-4">
      <div className={`transition-all duration-300 ease-in-out w-full ${activeTask ? "max-w-6xl" : "max-w-xl"}`}>
        {!activeTask ? (
          <Card className="border shadow-lg">
            <CardHeader className="text-center">
              <div className="flex items-center justify-center mb-2">
                <BrainCircuit className="h-8 w-8 text-primary mr-3" />
                <CardTitle className="text-2xl">Interactive Browser Session</CardTitle>
              </div>
              <CardDescription className="text-lg">What task should be performed?</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateTask}>
                <Textarea
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  className="resize-none mb-5"
                  placeholder="Describe the goal, e.g., 'Log into my bank account and download the statement for last month'"
                  rows={3}
                  required
                  disabled={isLoading}
                />
                {error && (
                  <Alert variant="destructive" className="mb-4">
                     <CircleX className="h-4 w-4" />
                     <AlertTitle>Error</AlertTitle>
                     <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Starting Session...
                    </>
                  ) : (
                    "Start Session"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-5">
            <Card>
              <CardContent className="p-4 flex flex-wrap justify-between items-center gap-4">
                <div className="flex items-center flex-grow min-w-0">
                  <span className="font-semibold mr-2">Goal:</span>
                  <span className="text-muted-foreground truncate flex-shrink" title={activeTask.description}>
                    {activeTask.description}
                  </span>
                </div>
                <div className="flex items-center space-x-4 flex-shrink-0">
                  {getStatusBadge(activeTask.status)}
                  <Separator orientation="vertical" className="h-6 hidden sm:block" />
                  <span className="text-sm text-muted-foreground hidden sm:inline">
                    {currentStep?.index && currentStep?.total
                      ? `Action ${currentStep.index}/${currentStep.total}`
                      : currentStep?.step_number
                      ? `Step ${currentStep.step_number}`
                      : (activeTask.status.toLowerCase() === 'running' ? 'Running...' : '')}
                  </span>
                  <Button variant="outline" size="sm" onClick={toggleVnc} className="gap-1">
                    {showVnc ? (
                      <>
                        <MonitorX className="h-4 w-4" />
                        <span className="hidden sm:inline">Hide Browser</span>
                      </>
                    ) : (
                      <>
                        <MonitorPlay className="h-4 w-4" />
                        <span className="hidden sm:inline">Show Browser</span>
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div
              className={`bg-card/50 rounded-lg shadow-lg overflow-hidden transition-all duration-500 ease-in-out ${ showVnc ? "h-[600px] opacity-100" : "h-0 opacity-0" } w-full flex items-center justify-center relative border`}
            >
              {showVnc && (
                <VncScreen
                  url={"ws://localhost:5901"}
                  scaleViewport
                  background="transparent"
                  style={{
                    width: "100%",
                    height: "100%",
                  }}
                />
              )}
            </div>

            <PlannerThoughtsBox />

            {currentStep?.pending_approval && currentStep.thought && (
              <Card>
                <CardHeader className="pb-2">
                   <div className="flex items-center gap-2">
                      <BrainCircuit className="h-5 w-5 text-purple-500" />
                      <CardTitle className="text-lg">Agent's Reasoning</CardTitle>
                   </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-muted/50 p-3 rounded-md text-sm text-foreground max-h-40 overflow-y-auto border">
                    <pre className="whitespace-pre-wrap font-mono text-xs">
                      {JSON.stringify(currentStep.thought, null, 2)}
                    </pre>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="p-4 space-y-4">
                 {currentStep?.pending_approval ? (
                    <Alert variant="default">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Approval Needed</AlertTitle>
                      <AlertDescription>
                         The agent proposes the action: <strong>{
                          currentStep.next_goal
                        
                        }</strong>. Please approve or reject.
                      </AlertDescription>
                    </Alert>
                 ) : activeTask.status.toLowerCase() === 'running' && !isTerminalStatus(activeTask.status) && !isPaused(activeTask.status) ? (
                    <Alert variant="default">
                      <Info className="h-4 w-4" />
                      <AlertTitle>Processing</AlertTitle>
                      <AlertDescription>
                         The agent is analyzing and performing the next action...
                         {currentStep?.next_goal && <span className="block mt-1 text-xs">Current goal: {currentStep.next_goal}</span>}
                      </AlertDescription>
                    </Alert>
                 ) : null}

                 {stepError && (
                    <Alert variant="destructive">
                       <CircleX className="h-4 w-4" />
                       <AlertTitle>Action Error</AlertTitle>
                       <AlertDescription>{stepError}</AlertDescription>
                    </Alert>
                 )}

                {activeTask && isTerminalStatus(activeTask.status) ? (
                  <div className="w-full flex justify-center">
                    <Button onClick={handleStartNewTask} variant="default" className="gap-2">
                      <RotateCcw className="h-4 w-4" />
                      Start New Task
                    </Button>
                  </div>
                ) : activeTask && isPaused(activeTask.status) ? (
                  <div className="w-full flex justify-center gap-3">
                    <Button onClick={handleResumeTask} variant="default" className="gap-2" disabled={isLoading}>
                       {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                       {isLoading ? 'Resuming...' : 'Resume Task'}
                    </Button>
                     <Button onClick={handleStartNewTask} variant="outline" className="gap-2">
                       <RotateCcw className="h-4 w-4" />
                       Start New Task
                     </Button>
                   </div>
                 ) : (
                  <div className="flex flex-wrap gap-3 justify-center sm:justify-end">
                    {currentStep?.pending_approval ? (
                      <>
                         <Button
                           variant="default"
                           className="gap-1"
                           onClick={handleApproveAction}
                           disabled={stepLoading}
                         >
                           {stepLoading ? (
                             <Loader2 className="h-4 w-4 animate-spin" />
                           ) : (
                             <Check className="h-4 w-4" />
                           )}
                           Approve
                         </Button>
                         <Button
                           variant="destructive"
                           className="gap-1"
                           onClick={handleRejectAction}
                           disabled={stepLoading}
                         >
                           {stepLoading ? (
                             <Loader2 className="h-4 w-4 animate-spin" />
                           ) : (
                             <XCircle className="h-4 w-4" />
                           )}
                           Reject
                         </Button>
                      </>
                     ) : (
                       <Button variant="outline" className="gap-1" disabled>
                         <Loader2 className="h-4 w-4 animate-spin" />
                         Agent Running...
                       </Button>
                     )}

                     <Button
                       variant="destructive"
                       className="gap-1"
                       onClick={handleCancelGoal}
                       disabled={stepLoading || isLoading}
                     >
                       <XCircle className="h-4 w-4" />
                       Cancel Goal
                     </Button>
                   </div>
                 )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </main>
  )
}
