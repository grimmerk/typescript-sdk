# PR Title
fix: prevent responses being sent to wrong client when multiple transports connect

# PR Description

<!-- Provide a brief summary of your changes -->
This PR enhances the Protocol class to correctly handle multiple client connections by ensuring responses are always sent back through their originating transport. Currently, when multiple clients connect to a Protocol instance, responses can be misdirected due to the transport reference being overwritten on each new connection.

## Motivation and Context
<!-- Why is this change needed? What problem does it solve? -->

### The Current Behavior
The Protocol class maintains a single `_transport` reference that gets updated each time `connect()` is called. This creates a scenario where responses can be sent to a different transport than the one that originated the request:

```typescript
// What happens now:
1. Client A (HR system) sends: "get employee salary data"
2. Client B (Public dashboard) connects → overwrites this._transport
3. Server processes A's request, sends response to this._transport
4. Client B receives sensitive salary data meant for Client A
```

This is not a theoretical edge case - it happens whenever clients connect while requests are being processed.

### Community Reports
This behavior has been observed and reported by multiple users:
- Issue #204: "Multiple clients/transports are not working correctly"
- Issue #243: "Protocol class should support multiple transports"

These reports highlight the challenges developers face when trying to scale MCP servers in production environments.

### Why This Must Be Fixed

#### 1. Security Risk
Responses containing sensitive data can be sent to the wrong client. In a scenario where Client A queries private data and Client B connects during processing, Client B receives Client A's confidential response. This is not just a privacy concern but a potential compliance violation (GDPR, HIPAA, etc.).

#### 2. Fundamental Correctness  
This violates the basic contract of request-response protocols - that responses return to their originator. No amount of application-level workarounds can reliably prevent this at scale.

#### 3. Architectural Limitation
Current workaround requires one server instance per client, which:
- Wastes memory and CPU resources  
- Complicates deployment and scaling
- Makes features like shared state or caching impossible
- Contradicts standard practices in network protocol implementations

#### 4. Specification Alignment
The MCP architecture documentation states "each client having a 1:1 relationship with a particular server" from the host's perspective - describing the logical relationship where each client connects to its designated server. This architectural principle doesn't require servers to be limited to single transport connections at the implementation level. 

Indeed, allowing servers to handle multiple transport connections is common in protocol implementations and is supported in other MCP SDKs like Python.

#### 5. Production Impact
Teams deploying MCP in production environments have encountered this limitation, as evidenced by issues #204 and #243. The current workaround of creating separate server instances per client adds complexity and resource overhead that could be avoided with proper multi-transport support.

## How Has This Been Tested?
<!-- Have you tested this in a real application? Which scenarios were tested? -->

### Test Implementation
Added comprehensive tests in `protocol-transport-handling.test.ts` that demonstrate:
1. **The Bug**: First commit (f997f86) adds tests that fail, showing responses going to wrong client
2. **The Fix**: Second commit makes tests pass by fixing the transport routing

### Test Scenarios Covered
- **Basic Multi-Client**: Two clients connect sequentially, first client's response incorrectly goes to second
- **Async Timing**: Demonstrates bug persists even with different request processing times
- **Real-world Pattern**: Simulates common scenario where new clients connect while requests are in-flight

### Reproducing the Bug
```bash
# See the bug in action - checkout test without fix
git checkout f997f86
npm test -- src/shared/protocol-transport-handling.test.ts

# Output shows:
# Transport A received: []  (should have 1 response)
# Transport B received: [   (has both responses!)
#   { result: { data: 'responseForA' }, jsonrpc: '2.0', id: 1 },
#   { result: { data: 'responseForA' }, jsonrpc: '2.0', id: 2 }
# ]
```

## Breaking Changes
<!-- Will users need to update their code or configurations? -->

No breaking changes. This fix is backward compatible and requires no changes to existing code.

## Types of changes
<!-- What types of changes does your code introduce? Put an `x` in all the boxes that apply: -->
- [x] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation update

## Checklist
<!-- Go over all the following points, and put an `x` in all the boxes that apply. -->
- [x] I have read the [MCP Documentation](https://modelcontextprotocol.io)
- [x] My code follows the repository's style guidelines
- [x] New and existing tests pass locally
- [x] I have added appropriate error handling
- [x] I have added or updated documentation as needed

## Additional context
<!-- Add any other context, implementation notes, or design decisions -->

### Implementation Approach
The fix is minimal and elegant - we capture the transport reference at request time using a closure:
```typescript
// Before: uses this._transport which can change
return this._transport?.send({ result, jsonrpc: "2.0", id: request.id });

// After: uses captured transport that won't change
const capturedTransport = this._transport;
return capturedTransport?.send({ result, jsonrpc: "2.0", id: request.id });
```

This ensures each request's lifecycle is bound to its originating transport, regardless of subsequent connections.

### Current Workaround vs Proper Fix
**Current Workaround** (inefficient):
```typescript
// Developers must create separate server instance per client
const server1 = new Server();  // For client A only
const server2 = new Server();  // For client B only
```

**With This Fix** (proper multi-client support):
```typescript
// Single server can handle multiple clients correctly
const server = new Server();
await server.connect(transportA);  // Client A works
await server.connect(transportB);  // Client B works, A still works
```

### Why This Wasn't Caught Earlier
The bug only manifests when:
1. Multiple clients connect to the same Protocol instance
2. Requests are processed asynchronously 
3. New connections arrive while requests are in-flight

Many examples and tests use single clients or synchronous handlers, masking the issue.

### Alignment with MCP Architecture
The MCP specification states that hosts manage multiple clients, each with a 1:1 relationship with a server. This fix ensures that relationship is properly maintained at the transport level, allowing a single server process to correctly handle multiple client connections as intended by the architecture.