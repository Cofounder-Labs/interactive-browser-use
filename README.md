# ✨ Interactive Browser Use ✨

A web-based interface allowing users to direct, observe, and control an AI agent performing browser automation tasks in real-time with interactive step approval.

🚀 **Take control of browser automation like never before!** This project provides a hands-on web UI where you can collaborate with an AI agent, guiding its browsing actions step-by-step. Watch it navigate, interact with elements, and complete tasks, all under your supervision.

## Key Features

*   👀 **Real-time Observation:** See exactly what the AI agent sees and does in the browser.
*   ✅ **Interactive Step Approval:** Review and approve each action before the agent proceeds.
*   ▶️ **Direct Control:** Guide the agent's direction and intervene when needed.
*   🌐 **Web-Based Interface:** Access and control the agent from your browser.
*   🧠 **Powered by `browser-use`:** Leverages the robust `browser-use` library (included in `src/browser-use-src`) for core agent capabilities.

## Setup Instructions

### Prerequisites

- Docker and Docker Compose

### Installation


1. Clone the repository and navigate to the project directory:
   ```bash
   git clone https://github.com/Cofounder-Labs/interactive-browser-use
   cd interactive-browser-use
   ```

2. Copy the example environment file and add your API keys:
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` and add your API keys:
   ```
   # Provide EITHER the OpenAI API Key OR the Azure configuration below

   # OpenAI API Key
   OPENAI_API_KEY=your_openai_api_key
   
   # --- OR ---
   
   # Azure OpenAI Configuration
   AZURE_ENDPOINT=https://your-resource-name.openai.azure.com/
   AZURE_OPENAI_API_KEY=your_azure_api_key
    
   ```

### Running with Docker

1.  Ensure Docker and Docker Compose are installed on your system.
2.  Build and run the services using Docker Compose:
    ```bash
    docker compose up --build
    ```
    This command builds the images if they don't exist and starts the backend server and the Chrome instance in detached mode.
3.  The application will be accessible at `http://localhost:3000`
4.  To stop the services:
    ```bash
    docker compose down
    ```

## Project Structure

```
interactive-browser-use/
├── .github/                # GitHub Actions workflows
├── frontend/               # Frontend application code (Next.js)
├── src/
│   ├── browser_agent/      # Backend FastAPI application and agent control logic
│   │   ├── web/            # FastAPI specific code (routes, models)
│   │   ├── utils/          # Utility functions
│   │   ├── agent.py        # Core agent interaction logic
│   │   └── cli.py          # Command-line interface (if applicable)
│   └── browser-use-src/    # Source code for the underlying browser-use library
├── .env.example            # Example environment variables
├── .gitignore
├── docker-compose.yml      # Docker Compose configuration
├── Dockerfile.backend      # Dockerfile for the backend service
├── Dockerfile.frontend     # Dockerfile for the frontend service
├── LICENSE
├── poetry.lock
├── pyproject.toml          # Python project configuration (Poetry)
├── README.md               # This file
└── run.py                  # Main entry point for running the backend locally
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributors

- Ritanshu Dokania
- Re Solver
