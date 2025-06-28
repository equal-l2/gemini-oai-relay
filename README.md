# Gemini-OAI Relay

OpenAI-compatible API server for the internal API used by the Gemini CLI.
Created for use with SillyTavern.

> [!IMPORTANT]
> This project is a community-driven effort and is not officially affiliated with Google, Gemini, or OpenAI.  
> Almost all of the core code is adapted from the [Gemini CLI](https://github.com/google-gemini/gemini-cli).  
> 
> **This project may be discontinued at the request of the rights holder.**

## Prerequisites

*   Node.js

## Setup

1.  Install dependencies

    ```bash
    npm install
    ```

2.  Authentication

    This relay uses credentials from the Gemini CLI (`~/.gemini/oauth_creds.json`).  
    You need to authenticate with the Gemini CLI first to create the credentials file.  
    Once the credentials are created, no manual authentication should be required.

3.  Build the project

    ```bash
    npm run build
    ```

4.  Start the server

    ```bash
    npm start
    ```

    The server will start on port `6666`.

## Supported Models

*   `gemini-2.5-flash`
*   `gemini-2.5-pro`

## API Endpoints

### `POST /v1/chat/completions`

This endpoint is compatible with the OpenAI Chat Completions API, allowing you to use it as a drop-in replacement for services that integrate with OpenAI.

#### Supported features

*   System prompts
*   Streaming responses
*   Image support (Audio and video should also be compatible in theory, not tested)

#### Example Request

```bash
curl -X POST http://localhost:6666/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{
         "model": "gemini-2.5-flash",
         "messages": [
             {"role": "user", "content": "Hello, who are you?"}
         ]
     }'
```

### `GET /v1/models`

This endpoint lists the available models.

#### Example Request

```bash
curl http://localhost:6666/v1/models
```

## TODO
- Think config (enable/disable, thinking budgets)

## Thanks
- Google, for creating Gemini and open-sourcing Gemini CLI
- [RooCodeInc/Roo-Code#5137](https://github.com/RooCodeInc/Roo-Code/pull/5137), for project ID mechanism