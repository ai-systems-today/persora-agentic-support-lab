# Interaction protocols

Protocols define how components exchange structured information. They do not decide whether an answer is correct; they make execution interoperable and observable.

## AG-UI

AG-UI carries progressive agent events to the application. The route emits run lifecycle, step lifecycle, text, sub-agent and custom evidence events.

An AG-UI label is runtime-proven only when the selected run contains captured protocol events.

## A2A

In the group-specialist path, the server discovers the specialist Agent Card, submits `message:send`, receives a task artifact, records participating specialists and returns bounded evidence to the coordinator.

## Server-Sent Events

SSE is the HTTP transport used to stream events from server to browser. It supports a progressive one-way event stream for one request.

## MCP and Playwright MCP

The source-browser function uses MCP tool calls to control an existing Playwright service. It permits only HTTPS targets on `help.netflix.com`, navigates to the original page and returns a current viewport image. The browser never receives the internal MCP URL.

## Protocol versus proof

| Statement | Required evidence |
|---|---|
| “AG-UI executed” | Captured AG-UI events from the same run |
| “A2A executed” | Agent Card discovery and task/message exchange |
| “Playwright opened the source” | Successful MCP result and returned image |
| “The answer is grounded” | Claim/source support and evaluation—not protocol events alone |
