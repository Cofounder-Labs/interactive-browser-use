const app = Vue.createApp({
    data() {
        return {
            taskDescription: '',
            activeTask: null,
            events: [],
            pollingInterval: null,
            pollingFrequency: 3000,
            isLoading: false,
            errorMessage: null
        }
    },
    computed: {
        canStartTask() {
            return !this.activeTask && this.taskDescription.trim().length > 0
        },
        canStopTask() {
            return this.activeTask && !['completed', 'failed', 'stopped'].includes(this.activeTask.status)
        },
        isTaskRunning() {
            return this.activeTask && !['completed', 'failed', 'stopped'].includes(this.activeTask.status)
        },
        currentTaskStatusClass() {
            if (!this.activeTask) return '';
            const statusClasses = {
                'created': 'bg-blue-100 text-blue-800',
                'running': 'bg-yellow-100 text-yellow-800',
                'completed': 'bg-green-100 text-green-800',
                'failed': 'bg-red-100 text-red-800',
                'stopped': 'bg-gray-100 text-gray-800'
            };
            return statusClasses[this.activeTask.status] || 'bg-gray-100 text-gray-800'
        }
    },
    methods: {
        async startTask() {
            if (!this.canStartTask) return;
            this.isLoading = true;
            this.errorMessage = null;
            this.events = [];

            try {
                const response = await fetch('/api/tasks', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ 
                        description: this.taskDescription 
                    }),
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
                }

                const taskInfo = await response.json();
                this.activeTask = {
                    id: taskInfo.task_id,
                    description: taskInfo.description,
                    status: taskInfo.status
                };
                this.taskDescription = '';
                this.startPolling();

            } catch (error) {
                console.error('Error starting task:', error);
                this.errorMessage = `Failed to start task: ${error.message}`;
                this.activeTask = null;
            } finally {
                this.isLoading = false;
            }
        },

        async stopTask() {
            if (!this.canStopTask || !this.activeTask) return;
            this.isLoading = true;
            this.errorMessage = null;

            try {
                const response = await fetch(`/api/tasks/${this.activeTask.id}/stop`, {
                    method: 'POST',
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
                }

                const taskInfo = await response.json();
                if (this.activeTask) {
                    this.activeTask.status = taskInfo.status; 
                }
                this.stopPolling();
                
            } catch (error) {
                console.error('Error stopping task:', error);
                this.errorMessage = `Failed to stop task: ${error.message}`;
            } finally {
                this.isLoading = false;
            }
        },

        async pollTaskStatus() {
            if (!this.activeTask || !this.isTaskRunning) {
                this.stopPolling();
                return;
            }
            
            try {
                const response = await fetch(`/api/tasks/${this.activeTask.id}`);
                if (!response.ok) {
                    if (response.status === 404) {
                        console.warn(`Task ${this.activeTask.id} not found.`);
                        this.errorMessage = `Task ${this.activeTask.id} not found on server.`;
                        this.activeTask = null;
                        this.stopPolling();
                    } else {
                         const errorData = await response.json();
                         throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
                    }
                    return;
                }

                const taskStatus = await response.json();
                
                this.activeTask.status = taskStatus.status;
                
                this.events = taskStatus.events.map((ev, index) => ({
                    id: `${taskStatus.task_id}-${index}-${ev.type}`,
                    type: ev.type || 'info',
                    message: ev.message || JSON.stringify(ev),
                    timestamp: new Date().toLocaleTimeString()
                }));

                 this.$nextTick(() => {
                        const container = this.$refs.eventsContainer;
                        if (container) {
                             container.scrollTop = container.scrollHeight;
                        }
                 });

                if (!this.isTaskRunning) {
                    this.stopPolling();
                }
                
            } catch (error) {
                console.error('Error polling task status:', error);
                this.errorMessage = `Error fetching task status: ${error.message}`;
            }
        },

        startPolling() {
            this.stopPolling();
            this.errorMessage = null;
            this.pollTaskStatus();
            this.pollingInterval = setInterval(this.pollTaskStatus, this.pollingFrequency);
            console.log(`Polling started for task ${this.activeTask?.id}`);
        },

        stopPolling() {
            if (this.pollingInterval) {
                clearInterval(this.pollingInterval);
                this.pollingInterval = null;
                console.log('Polling stopped');
            }
        },

        getEventClass(type) {
            const typeLower = String(type).toLowerCase();
            if (typeLower.includes('error') || typeLower.includes('fail')) return 'event-error';
            if (typeLower.includes('complete') || typeLower.includes('success')) return 'event-success';
            if (typeLower.includes('warn')) return 'event-warning';
            return 'event-info';
        }
    },
    mounted() {
    },
    beforeUnmount() {
        this.stopPolling();
    }
})

app.mount('#app')