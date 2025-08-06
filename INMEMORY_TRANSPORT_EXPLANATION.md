# InMemoryTransport Custom Context Implementation

## Why InMemoryTransport's send() Method is Different

The `InMemoryTransport` is unique among all transport implementations because it creates a **bidirectional** connection between two transport instances (client and server):

```typescript
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
```

## Message Flow in InMemoryTransport

```typescript
// Client side
client.request() 
  → clientTransport.send(message)
    → serverTransport.onmessage(message, extra)  // Need to inject customContext here
      → server processes request
        → server's tool handler receives extra.customContext

// Server response
server response
  → serverTransport.send(response)
    → clientTransport.onmessage(response)  // No customContext needed here
```

## Message Flow in Other Transports

### SSE/Streamable HTTP:
```typescript
HTTP Client → POST /messages
  → transport.handleMessage() or handleRequest()
    → inject customContext here
      → transport.onmessage(message, { customContext })
        → server processes request

// Server response
server response
  → transport.send(response)  // Just sends HTTP response or SSE event
    → HTTP Client
```

### Stdio:
```typescript
stdin → message
  → transport.processReadBuffer()
    → inject customContext here
      → transport.onmessage(message, { customContext })
        → server processes request

// Server response  
server response
  → transport.send(response)  // Just writes to stdout
    → stdout
```

## Key Differences

1. **InMemoryTransport**: 
   - `send()` method triggers the other transport's `onmessage`
   - Client's `send()` → Server's `onmessage` (needs context injection)
   - Server's `send()` → Client's `onmessage` (no context needed)
   - The customContext is set on the **server** transport but needs to be passed when the **client** sends a message

2. **Other Transports**:
   - `send()` method only sends responses to external systems (HTTP response, stdout)
   - Context injection happens when receiving messages, not sending
   - `send()` and `onmessage` are separate concerns

## Implementation Detail

In InMemoryTransport's `send()` method:
```typescript
// 'this' is the sending transport (e.g., clientTransport)
// 'this._otherTransport' is the receiving transport (e.g., serverTransport)
const enhancedExtra: MessageExtraInfo = {
  ...extra,
  customContext: this._otherTransport._customContext  // Get customContext from the receiving transport
};
this._otherTransport.onmessage(message, enhancedExtra);
```

This is why only InMemoryTransport's `send()` method needs to handle customContext - because it's actually triggering the other side's `onmessage` handler directly!