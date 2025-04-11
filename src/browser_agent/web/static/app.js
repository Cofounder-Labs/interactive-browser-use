const app = Vue.createApp({
    data() {
        return {
            connected: false,
            taskDescription: '',
            autoApprove: false,
            activeTask: null,
            events: [],
            pendingStep: null,
            ws: null,
            reconnectAttempts: 0,
            maxReconnectAttempts: 5,
            reconnectDelay: 1000
        }
    },
    computed: {
        connectionStatus() {
            return this.connected ? 'Connected' : 'Disconnected'
        },
        connectionStatusClass() {
            return this.connected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        },
        canStartTask() {
            return this.connected && !this.activeTask && this.taskDescription.trim().length > 0
        },
        canStopTask() {
            return this.connected && this.activeTask
        }
    },
    methods: {
        connectWebSocket() {
            if (this.ws) {
                this.ws.close()
            }

            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
            this.ws = new WebSocket(`${protocol}//${window.location.host}/ws`)

            this.ws.onopen = () => {
                this.connected = true
                this.reconnectAttempts = 0
                console.log('WebSocket connected')
            }

            this.ws.onclose = () => {
                this.connected = false
                console.log('WebSocket disconnected')
                this.handleReconnect()
            }

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error)
                this.connected = false
            }

            this.ws.onmessage = (event) => {
                const data = JSON.parse(event.data)
                this.handleWebSocketMessage(data)
            }
        },

        handleReconnect() {
            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                console.log('Max reconnection attempts reached')
                return
            }

            setTimeout(() => {
                this.reconnectAttempts++
                console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
                this.connectWebSocket()
            }, this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1))
        },

        handleWebSocketMessage(data) {
            switch (data.type) {
                case 'task_started':
                    this.activeTask = {
                        id: data.task_id,
                        description: data.description,
                        status: 'running'
                    }
                    break

                case 'task_completed':
                    this.activeTask = null
                    this.events = []
                    break

                case 'task_failed':
                    this.activeTask.status = 'failed'
                    break

                case 'step_approval_required':
                    this.pendingStep = {
                        id: data.step_id,
                        description: data.description
                    }
                    break

                case 'event':
                    this.events.push({
                        id: Date.now(),
                        type: data.event_type,
                        message: data.message,
                        timestamp: new Date().toLocaleTimeString()
                    })
                    this.$nextTick(() => {
                        const container = this.$refs.eventsContainer
                        container.scrollTop = container.scrollHeight
                    })
                    break
            }
        },

        startTask() {
            if (!this.canStartTask) return

            this.ws.send(JSON.stringify({
                type: 'start_task',
                description: this.taskDescription,
                auto_approve: this.autoApprove
            }))

            this.taskDescription = ''
        },

        stopTask() {
            if (!this.canStopTask) return

            this.ws.send(JSON.stringify({
                type: 'stop_task',
                task_id: this.activeTask.id
            }))
        },

        approveStep() {
            if (!this.pendingStep) return

            this.ws.send(JSON.stringify({
                type: 'approve_step',
                step_id: this.pendingStep.id,
                approved: true
            }))

            this.pendingStep = null
        },

        rejectStep() {
            if (!this.pendingStep) return

            this.ws.send(JSON.stringify({
                type: 'approve_step',
                step_id: this.pendingStep.id,
                approved: false
            }))

            this.pendingStep = null
        },

        getEventClass(type) {
            return {
                'info': 'event-info',
                'success': 'event-success',
                'warning': 'event-warning',
                'error': 'event-error'
            }[type] || 'event-info'
        }
    },
    mounted() {
        this.connectWebSocket()
        window.addEventListener('beforeunload', () => {
            if (this.ws) {
                this.ws.close()
            }
        })
    }
})

app.mount('#app')