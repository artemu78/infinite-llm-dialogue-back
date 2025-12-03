# Client-Polling Architecture with AI Persona Selector

This diagram illustrates the **client-server polling flow** for handling user messages and AI persona responses in our system. The flow ensures **async processing**, **history-aware persona selection**, and **polling-based updates** without persistent WebSockets.

```mermaid
flowchart TD
    %% Client sends messages
    A[Client App] -->|Send user message| B[API Gateway<br>/chat]

    %% Main Lambda routing
    B -->|Invoke| C[Lambda Handler]
    C -->|Branch by path| C1{rawPath}
    C1 -->|/news| N[Return news]
    C1 -->|/getchat| R[Return chat log]
    C1 -->|default chat| S[Store user msg<br>DynamoDB]

    %% AI Persona Selector
    S --> PS[AI Persona Selector<br>(history + tone + expertise, may return 0)]
    PS -->|0 personas| ACK[Return ACK only]
    PS -->|1 persona| Q[[SQS Queue<br>enqueue persona job]]

    %% Acknowledgement to client
    ACK --> A

    %% AI Turn Lambda
    Q --> T[AI Turn Lambda]
    T -->|Load history + generate reply| D[Persist AI reply<br>DynamoDB]
    D --> P[Optional: re-enqueue if needed]

    %% Client polling to get messages
    A -->|Poll /getchat| R