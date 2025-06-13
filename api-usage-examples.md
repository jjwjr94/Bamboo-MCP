# Bamboo MCP API Usage Examples

This document provides comprehensive examples of how to use the Bamboo MCP Gateway API for various operations.

## Authentication Examples

### Facebook OAuth Authentication

```bash
# Step 1: Authenticate with Facebook token
curl -X POST http://localhost:8443/auth/facebook/token \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "EAABwzLixnjYBAOZBZBZBZBZB..."
  }'

# Response:
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "userId": "123456789",
    "email": "user@example.com",
    "provider": "facebook"
  }
}
```

### Pipeboard Authentication

```bash
# Authenticate with Pipeboard API token
curl -X POST http://localhost:8443/auth/pipeboard \
  -H "Content-Type: application/json" \
  -d '{
    "pipeboardToken": "pb_live_1234567890abcdef..."
  }'
```

### Token Verification

```bash
# Verify JWT token
curl -X POST http://localhost:8443/auth/token/verify \
  -H "Content-Type: application/json" \
  -d '{
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

## MCP Protocol Examples

### Get Server Manifest

```bash
# Get MCP server capabilities
curl http://localhost:8443/manifest

# Response:
{
  "version": "0.2.0",
  "name": "bamboo-mcp",
  "description": "All-in-One MCP Gateway combining Meta Ads and PostgreSQL functionality",
  "author": {
    "name": "Jay Wong",
    "email": "jay@example.com"
  }
}
```

### List Available Tools

```bash
# Get all available tools
curl -X POST http://localhost:8443/stream \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "1",
    "method": "tools/list",
    "params": {}
  }'
```

## Meta Ads Examples

### Get Campaigns

```bash
# Retrieve advertising campaigns
curl -X POST http://localhost:8443/stream \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "2",
    "method": "tools/call",
    "params": {
      "name": "ads.get_campaigns",
      "arguments": {
        "account_id": "act_123456789",
        "limit": 10,
        "fields": ["id", "name", "status", "objective"]
      }
    }
  }'
```

### Create Campaign

```bash
# Create new advertising campaign
curl -X POST http://localhost:8443/stream \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "3",
    "method": "tools/call",
    "params": {
      "name": "ads.create_campaign",
      "arguments": {
        "account_id": "act_123456789",
        "name": "Summer Sale Campaign",
        "objective": "CONVERSIONS",
        "status": "PAUSED",
        "special_ad_categories": []
      }
    }
  }'
```

### Get Campaign Insights

```bash
# Retrieve campaign performance data
curl -X POST http://localhost:8443/stream \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "4",
    "method": "tools/call",
    "params": {
      "name": "ads.get_insights",
      "arguments": {
        "object_id": "123456789",
        "level": "campaign",
        "fields": ["impressions", "clicks", "spend", "ctr", "cpc"],
        "time_range": {
          "since": "2024-01-01",
          "until": "2024-01-31"
        }
      }
    }
  }'
```

## PostgreSQL Examples

### Execute Query

```bash
# Execute SQL query
curl -X POST http://localhost:8443/stream \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "5",
    "method": "tools/call",
    "params": {
      "name": "pg.execute_query",
      "arguments": {
        "query": "SELECT * FROM company_profiles WHERE json_data->>'\''industry'\'' = $1 LIMIT 10",
        "params": ["Technology"]
      }
    }
  }'
```

### Describe Table

```bash
# Get table schema information
curl -X POST http://localhost:8443/stream \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "6",
    "method": "tools/call",
    "params": {
      "name": "pg.describe_table",
      "arguments": {
        "table_name": "company_profiles"
      }
    }
  }'
```

## Company Profile Management Examples

### Get Company Profile

```bash
# Retrieve company profile
curl -X POST http://localhost:8443/stream \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "7",
    "method": "tools/call",
    "params": {
      "name": "get_company_profile",
      "arguments": {
        "companyId": "550e8400-e29b-41d4-a716-446655440000"
      }
    }
  }'
```

### Update Company Profile

```bash
# Update company profile
curl -X POST http://localhost:8443/stream \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "8",
    "method": "tools/call",
    "params": {
      "name": "update_company_profile",
      "arguments": {
        "companyId": "550e8400-e29b-41d4-a716-446655440000",
        "profileData": {
          "name": "Acme Corporation Updated",
          "industry": "Technology",
          "settings": {
            "timezone": "America/New_York",
            "currency": "USD"
          },
          "meta_ads": {
            "account_id": "act_123456789",
            "default_objective": "CONVERSIONS"
          }
        }
      }
    }
  }'
```

### List Company Profiles

```bash
# List all company profiles
curl -X POST http://localhost:8443/stream \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "9",
    "method": "tools/call",
    "params": {
      "name": "list_company_profiles",
      "arguments": {
        "limit": 20,
        "offset": 0
      }
    }
  }'
```

## Resource Management Examples

### List Available Resources

```bash
# Get available prompt resources
curl -X POST http://localhost:8443/stream \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "10",
    "method": "resources/list",
    "params": {}
  }'
```

### Read Resource Content

```bash
# Read specific resource
curl -X POST http://localhost:8443/stream \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "11",
    "method": "resources/read",
    "params": {
      "uri": "mcp://bamboo/prompts/team_default_context.md"
    }
  }'
```

## Error Handling Examples

### Invalid Authentication

```bash
# Request without authentication
curl -X POST http://localhost:8443/stream \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "12",
    "method": "tools/list",
    "params": {}
  }'

# Response:
{
  "error": "Authentication required",
  "code": 401,
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Rate Limit Exceeded

```bash
# Too many requests
# Response:
{
  "jsonrpc": "2.0",
  "id": "13",
  "error": {
    "code": -32603,
    "message": "Rate limit exceeded. Try again in 45 seconds."
  }
}
```

### Invalid Tool Call

```bash
# Call non-existent tool
curl -X POST http://localhost:8443/stream \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "14",
    "method": "tools/call",
    "params": {
      "name": "nonexistent.tool",
      "arguments": {}
    }
  }'

# Response:
{
  "jsonrpc": "2.0",
  "id": "14",
  "error": {
    "code": -32601,
    "message": "Unknown gateway tool: nonexistent.tool"
  }
}
```

## Batch Operations Examples

### Multiple Tool Calls

```bash
# Execute multiple operations in sequence
# Note: Each call should be made separately as MCP doesn't support batch requests

# 1. Get campaigns
curl -X POST http://localhost:8443/stream \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "batch_1",
    "method": "tools/call",
    "params": {
      "name": "ads.get_campaigns",
      "arguments": {"account_id": "act_123456789"}
    }
  }'

# 2. Get company profile
curl -X POST http://localhost:8443/stream \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "batch_2",
    "method": "tools/call",
    "params": {
      "name": "get_company_profile",
      "arguments": {"companyId": "550e8400-e29b-41d4-a716-446655440000"}
    }
  }'
```

## Health Check Examples

### Basic Health Check

```bash
# Check system health
curl http://localhost:8443/health

# Response:
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00Z",
  "version": "0.2.0",
  "uptime": 3600,
  "memory": {
    "rss": 52428800,
    "heapTotal": 29360128,
    "heapUsed": 20971520,
    "external": 1048576
  },
  "environment": "production"
}
```

## JavaScript/Node.js Client Examples

### Using fetch API

```javascript
// Authentication
async function authenticate(facebookToken) {
  const response = await fetch('http://localhost:8443/auth/facebook/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      access_token: facebookToken
    })
  });
  
  const data = await response.json();
  return data.token;
}

// Tool call
async function callTool(jwtToken, toolName, arguments) {
  const response = await fetch('http://localhost:8443/stream', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwtToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now().toString(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: arguments
      }
    })
  });
  
  return await response.json();
}

// Usage example
async function main() {
  try {
    const token = await authenticate('your-facebook-token');
    
    const campaigns = await callTool(token, 'ads.get_campaigns', {
      account_id: 'act_123456789',
      limit: 10
    });
    
    console.log('Campaigns:', campaigns.result);
  } catch (error) {
    console.error('Error:', error);
  }
}
```

### Using axios

```javascript
const axios = require('axios');

class BambooMCPClient {
  constructor(baseURL = 'http://localhost:8443') {
    this.baseURL = baseURL;
    this.token = null;
  }
  
  async authenticate(facebookToken) {
    const response = await axios.post(`${this.baseURL}/auth/facebook/token`, {
      access_token: facebookToken
    });
    
    this.token = response.data.token;
    return this.token;
  }
  
  async callTool(toolName, arguments) {
    if (!this.token) {
      throw new Error('Not authenticated');
    }
    
    const response = await axios.post(`${this.baseURL}/stream`, {
      jsonrpc: '2.0',
      id: Date.now().toString(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: arguments
      }
    }, {
      headers: {
        'Authorization': `Bearer ${this.token}`
      }
    });
    
    return response.data;
  }
}

// Usage
const client = new BambooMCPClient();
await client.authenticate('your-facebook-token');
const result = await client.callTool('ads.get_campaigns', {
  account_id: 'act_123456789'
});
```

## Python Client Examples

```python
import requests
import json

class BambooMCPClient:
    def __init__(self, base_url='http://localhost:8443'):
        self.base_url = base_url
        self.token = None
    
    def authenticate(self, facebook_token):
        response = requests.post(f'{self.base_url}/auth/facebook/token', 
                               json={'access_token': facebook_token})
        response.raise_for_status()
        
        data = response.json()
        self.token = data['token']
        return self.token
    
    def call_tool(self, tool_name, arguments):
        if not self.token:
            raise ValueError('Not authenticated')
        
        headers = {'Authorization': f'Bearer {self.token}'}
        payload = {
            'jsonrpc': '2.0',
            'id': str(int(time.time())),
            'method': 'tools/call',
            'params': {
                'name': tool_name,
                'arguments': arguments
            }
        }
        
        response = requests.post(f'{self.base_url}/stream', 
                               json=payload, headers=headers)
        response.raise_for_status()
        
        return response.json()

# Usage
client = BambooMCPClient()
client.authenticate('your-facebook-token')
result = client.call_tool('ads.get_campaigns', {
    'account_id': 'act_123456789',
    'limit': 10
})
print(json.dumps(result, indent=2))
```

These examples demonstrate the full range of Bamboo MCP Gateway capabilities and provide practical templates for integration into various applications and workflows.

