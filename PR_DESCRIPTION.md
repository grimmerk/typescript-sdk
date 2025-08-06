# PR Title
feat: Add custom context support for MCP transports

# PR Description

This PR adds support for passing custom context data from transport implementations to MCP handlers (tools, resources, prompts). This enables server implementations to inject application-specific context like tenant ID, user info, feature flags, etc. without relying on closures or global state.

## Motivation and Context

Currently, MCP server implementations have no standard way to pass request-specific context (e.g., authentication info, tenant data) from the transport layer to tool/resource/prompt handlers. This limitation forces developers to use workarounds like closures or session-based context maps.

This PR solves this problem by:
- Adding a `customContext` field to `MessageExtraInfo` 
- Passing it through `RequestHandlerExtra` to all handlers
- Providing a `setCustomContext()` method on all transport implementations

## Implementation Details

### Core Changes:
- **types.ts**: Added optional `customContext?: Record<string, unknown>` to `MessageExtraInfo`
- **shared/protocol.ts**: Added `customContext` to `RequestHandlerExtra`, passed through in `_onrequest`
- **shared/transport.ts**: Added optional `setCustomContext()` method to Transport interface

### Transport Implementations:
- **InMemoryTransport**: Stores and merges custom context with message extra info
- **SSEServerTransport**: Injects custom context in `handleMessage()`
- **StreamableHTTPServerTransport**: Includes custom context in all `onmessage()` calls
- **StdioServerTransport**: Passes custom context with processed messages

### Usage Example:
```typescript
// Set custom context on transport
const transport = new SSEServerTransport('/messages', res);
transport.setCustomContext({
  tenantId: authContext.user?.tenantId,
  userId: authContext.user?.id,
  featureFlags: { betaMode: true }
});

// Access in tool handler
server.tool('search', async ({ query }, extra) => {
  const tenantId = extra.customContext?.tenantId;
  const userId = extra.customContext?.userId;
  // Use context for tenant-specific operations
});
```

## How Has This Been Tested?

- ✅ Unit test added for InMemoryTransport custom context propagation
- ✅ Manually tested with SSE and Streamable HTTP transports in a real application
- ✅ All existing tests continue to pass
- ✅ Verified the same implementation pattern is applied consistently across all transports

## Breaking Changes

None. All changes are backwards compatible:
- `customContext` is an optional field
- `setCustomContext()` is an optional method
- Existing code will continue to work without modifications

## Types of changes
- [ ] Bug fix (non-breaking change which fixes an issue)
- [x] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation update

## Checklist
- [x] I have read the [MCP Documentation](https://modelcontextprotocol.io)
- [x] My code follows the repository's style guidelines
- [x] New and existing tests pass locally
- [x] I have added appropriate error handling
- [x] I have added or updated documentation as needed

## Additional context

This feature was developed to address the need for multi-tenant MCP server implementations where request-specific context needs to be available throughout the handler chain. The implementation follows existing patterns in the codebase (similar to how `authInfo` and `requestInfo` are handled) and maintains full backwards compatibility.

### Implementation Notes:
- All transport implementations follow the same pattern for consistency
- Testing focused on InMemoryTransport as it covers the core functionality
- Manual testing confirmed the feature works correctly with SSE and Streamable HTTP in production scenarios

### Future Enhancements:
- Consider adding TypeScript generics for type-safe custom context (would require broader changes)
- Add integration tests for all transport types
- Update documentation with custom context examples