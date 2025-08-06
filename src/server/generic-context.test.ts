import { describe, expect, test } from "@jest/globals";
import { Server } from "./index.js";
import { SSEServerTransport } from "./sse.js";
import { InMemoryTransport } from "../inMemory.js";
import { Client } from "../client/index.js";
import { z } from "zod";

// Define custom context type
interface DatabaseContext {
  db: {
    connectionString: string;
    poolSize: number;
  };
  userId: string;
  tenantId: string;
}

describe("Generic custom context support", () => {
  test("should infer custom context type in tool handlers", async () => {
    // Create typed server
    const server = new Server<never, never, never, DatabaseContext>({
      name: "test-server",
      version: "1.0.0",
    });

    let capturedContext: DatabaseContext | undefined;

    // Register a tool - the extra parameter should have properly typed customContext
    server.setRequestHandler(
      {
        shape: {
          method: z.literal("tools/call"),
          params: z.object({
            name: z.string(),
            arguments: z.record(z.unknown()).optional(),
          }),
        },
      },
      async (request, extra) => {
        // TypeScript should infer that extra.customContext is DatabaseContext
        capturedContext = extra.customContext;
        
        // This should have proper type checking
        const dbConnection = extra.customContext?.db.connectionString;
        const userId = extra.customContext?.userId;
        
        return {
          content: [{
            type: "text",
            text: `DB: ${dbConnection}, User: ${userId}`
          }]
        };
      }
    );

    // Create typed transport
    const serverTransport = new SSEServerTransport<DatabaseContext>({ 
      endpoint: "/test" 
    });

    // Set custom context with proper typing
    serverTransport.setCustomContext({
      db: {
        connectionString: "postgresql://localhost:5432/mydb",
        poolSize: 10
      },
      userId: "user-123",
      tenantId: "tenant-456"
    });

    await server.connect(serverTransport);

    // Simulate a request
    await serverTransport.handleMessage({
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        name: "test-tool",
        arguments: {}
      },
      id: 1
    });

    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 10));

    // Verify context was passed correctly
    expect(capturedContext).toEqual({
      db: {
        connectionString: "postgresql://localhost:5432/mydb",
        poolSize: 10
      },
      userId: "user-123",
      tenantId: "tenant-456"
    });
  });

  test("should work with InMemoryTransport generic types", async () => {
    interface ApiContext {
      apiKey: string;
      rateLimits: {
        requestsPerMinute: number;
        burstSize: number;
      };
    }

    // Create typed transport pair
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair<ApiContext>();

    // Create typed server
    const server = new Server<never, never, never, ApiContext>({
      name: "api-server",
      version: "1.0.0",
    });

    let receivedContext: ApiContext | undefined;

    server.setRequestHandler(
      {
        shape: {
          method: z.literal("api/test"),
          params: z.object({}),
        },
      },
      async (request, extra) => {
        receivedContext = extra.customContext;
        return { success: true };
      }
    );

    // Set context on server transport
    serverTransport.setCustomContext({
      apiKey: "secret-key-123",
      rateLimits: {
        requestsPerMinute: 60,
        burstSize: 10
      }
    });

    await server.connect(serverTransport);

    // Client side
    const client = new Client({
      name: "test-client",
      version: "1.0.0"
    });
    await client.connect(clientTransport);

    // Send request through client
    await clientTransport._otherTransport?.onmessage?.({
      jsonrpc: "2.0",
      method: "api/test",
      params: {},
      id: 2
    });

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(receivedContext).toEqual({
      apiKey: "secret-key-123",
      rateLimits: {
        requestsPerMinute: 60,
        burstSize: 10
      }
    });
  });
});