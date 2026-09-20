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

For the exact `/en/contactus` path, the client can request the bounded `reveal-contact-options` interaction. The Edge Function switches to a mobile-width viewport, submits a fixed synthetic customer-service request and detects the Call/Chat controls before returning the screenshot. It never receives or transmits the customer's question or conversation. The response truthfully says `mobile-width`; genuine device emulation remains unclaimed until the MCP service configuration is independently verified.

The interaction never activates the final Call or Chat control. If Netflix changes the page or exposes no channel, the function fails visibly and the UI retains direct official links.

## Protocol versus proof

| Statement | Required evidence |
|---|---|
| “AG-UI executed” | Captured AG-UI events from the same run |
| “A2A executed” | Agent Card discovery and task/message exchange |
| “Playwright opened the source” | Successful MCP result and returned image |
| “The answer is grounded” | Claim/source support and evaluation—not protocol events alone |
