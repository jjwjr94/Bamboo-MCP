# MCP Server Implementation Analysis

## Key Findings from Postgres MCP Server

### MCP Framework Usage
- Uses `FastMCP` from `mcp.server.fastmcp`
- Tools defined with `@mcp.tool(description="...")` decorator
- Returns `ResponseType` which can be `TextContent`, `ImageContent`, or `EmbeddedResource`
- Async functions for tool implementations

### Server Structure
```python
# Initialize FastMCP with default settings
mcp = FastMCP("postgres-mcp")

# Tool definition pattern
@mcp.tool(description="Tool description")
async def tool_name(param: str = Field(description="Parameter description")) -> ResponseType:
    """Tool implementation"""
    try:
        # Tool logic here
        return format_text_response(result)
    except Exception as e:
        return format_error_response(str(e))
```

### Access Control
- `AccessMode.UNRESTRICTED` - Full access
- `AccessMode.RESTRICTED` - Read-only with safety features
- Global variables for configuration

### Response Formatting
- `format_text_response(text)` - Returns TextContent
- `format_error_response(error)` - Returns error TextContent
- Support for multiple response types

### Transport Support
- Stdio transport (default)
- SSE transport for web integration
- Command line argument parsing for configuration

## Key Insights for Bamboo MCP Gateway
1. **Tool Routing**: Need to intercept tool calls and route based on prefix (ads.*, pg.*)
2. **Authentication**: Need to handle Meta Ads OAuth and JWT tokens
3. **Proxy Pattern**: Forward tool calls to upstream MCP servers
4. **Response Handling**: Maintain MCP response format compatibility
5. **Resource Management**: Support MCP resource endpoints for prompt seeding

