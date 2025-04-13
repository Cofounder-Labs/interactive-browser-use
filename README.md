# Interactive Browser Use

A web-based interface allowing users to direct, observe, and control an AI agent performing browser automation tasks in real-time with interactive step approval.

## Setup Instructions

### Prerequisites

- Python 3.11 or higher (if running locally without Docker)
- Poetry (Python package manager, if running locally without Docker)
- Chrome browser installed (for browser automation, if running locally without Docker)
- Docker and Docker Compose (if running with Docker)

### Installation

1. Install Poetry if not already installed. Follow the instructions at [Poetry's official website](https://python-poetry.org/docs/#installation).

2. Clone the repository and navigate to the project directory:
   ```bash
   git clone <repository-url>
   cd interactive-browser-use
   ```

3. Install dependencies using Poetry:
   ```bash
   poetry install
   ```

4. Copy the example environment file and add your API keys:
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` and add your API keys:
   ```
   # OpenAI API Key (Required if not using Azure OpenAI)
   OPENAI_API_KEY=your_openai_api_key
   
   # Azure OpenAI Configuration (Required if not using OpenAI directly)
   AZURE_ENDPOINT=https://your-resource-name.openai.azure.com/
   AZURE_OPENAI_API_KEY=your_azure_api_key
   
   # Optional API Keys for other models
   ANTHROPIC_API_KEY=your_anthropic_api_key
   GEMINI_API_KEY=your_gemini_api_key
   DEEPSEEK_API_KEY=your_deepseek_api_key
   
   # Application Configuration
   CHROME_DEBUG_PORT=9222
   APP_PORT=8000
   ```

   Note: You need to provide either OpenAI API key or Azure OpenAI configuration, but not both.

### Running with Docker (Recommended)

1.  Ensure Docker and Docker Compose are installed on your system.
2.  Copy the example environment file:
    ```bash
    cp .env.example .env
    ```
3.  Edit the `.env` file and add your API keys and configurations as described in the local setup section. Ensure `CHROME_DEBUG_PORT` is set (e.g., 9222) and `APP_PORT` is set (e.g., 8000).
4.  Build and run the services using Docker Compose:
    ```bash
    docker compose up --build -d
    ```
    This command builds the images if they don't exist and starts the backend server and the Chrome instance in detached mode.
5.  The application will be accessible at `http://localhost:8000` (or the `APP_PORT` you configured).
6.  To stop the services:
    ```bash
    docker compose down
    ```

### Running Locally (Without Docker)

1. Activate the Poetry environment:
   ```bash
   poetry shell
   ```

2. Run the application:
   ```bash
   poetry run python run.py
   ```
   This will start the FastAPI server on `http://localhost:8000` by default (or the `APP_PORT` configured in `.env`).

   Alternatively, you can run the server directly with uvicorn:
   ```bash
   poetry run uvicorn browser_agent.web.app:app --reload --host 0.0.0.0 --port 8000
   ```

### Running Tests

To run the test suite:
```bash
poetry run pytest
```

### Development Tools

The project includes several development tools that can be run with Poetry:

- Format code with Black:
  ```bash
  poetry run black .
  ```

- Sort imports with isort:
  ```bash
  poetry run isort .
  ```

- Check code style with flake8:
  ```bash
  poetry run flake8
  ```

## Project Structure

- `src/browser_agent/`: Main application code
- `tests/`: Test files
- `frontend/`: Frontend application code
- `run.py`: Main entry point for running the application

## Azure OpenAI Support

This project supports both OpenAI's API directly and Azure OpenAI services. To use Azure OpenAI:

1. Set up an Azure OpenAI resource in the Azure portal
2. Configure the following environment variables:
   - `AZURE_ENDPOINT`: The endpoint URL of your Azure OpenAI resource
   - `AZURE_OPENAI_API_KEY`: The API key for your Azure OpenAI resource

The application will automatically detect and use Azure OpenAI if these environment variables are set, otherwise it will fall back to using OpenAI's API directly.

## Contributors

- Ritanshu Dokania
- Re Solver
