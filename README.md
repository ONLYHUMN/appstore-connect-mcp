# Apple Store Connect MCP Server

A Model Context Protocol (MCP) server that provides tools for interacting with Apple Store Connect API, enabling management of iOS/macOS apps, TestFlight, app metadata, and more through Claude Desktop, Cursor, or other MCP clients.

## Features

### App Management
- **List Apps**: View all apps in your App Store Connect account
- **App Information**: Get detailed app info including status and metadata
- **App Store Versions**: Create and manage app store versions
- **Localization**: Update app descriptions and metadata for different markets

### Analytics & Sales
- **Sales Data**: Retrieve sales and revenue information
- **Analytics**: Access app analytics including installs and user engagement
- **Customer Reviews**: Read and analyze customer feedback
- **Pricing Information**: View current app pricing across different regions

### TestFlight Integration
- **Build Management**: View TestFlight builds and their status
- **Beta Groups**: Manage TestFlight beta testing groups
- **Tester Management**: Add and manage beta testers

### Additional Features
- **In-App Purchases**: View and manage in-app purchase products
- **App Availability**: Check app availability across different regions
- **Category & Rating**: Access app category and age rating information

## Setup

### Prerequisites
- Node.js 18+
- Apple Developer Account with App Store Connect access
- App Store Connect API key

### Apple Store Connect API Key Setup

1. **Generate API Key**:
   - Go to [App Store Connect](https://appstoreconnect.apple.com)
   - Navigate to Users and Access → Integrations → App Store Connect API
   - Create a new API key with appropriate permissions

2. **Environment Variables** — copy `.env.example` to `.env` and fill in:

   ```bash
   APPLE_KEY_ID=your_key_id
   APPLE_ISSUER_ID=your_issuer_id
   APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
   your_private_key_content
   -----END PRIVATE KEY-----"
   PORT=3992
   OAUTH_ENABLED=false
   ```

### Run locally

```bash
npm install
npm run build
npm start
```

Server listens at `http://localhost:3992/mcp` (or whatever `PORT` you set). Apple credentials stay in `.env` on the machine running the server — not in the MCP client config.

### MCP client config (URL only, no auth)

```json
{
  "mcpServers": {
    "appstore-connect": {
      "url": "http://localhost:3992/mcp"
    }
  }
}
```

Keep the server process running while you use the client. With `OAUTH_ENABLED=false`, the `/mcp` endpoint has no client authentication.

## Usage

Once configured, you can ask Claude to:

- "Show me my app's latest sales data"
- "List all TestFlight builds for my app"
- "What are the recent customer reviews?"
- "Create a new app store version"
- "Add a beta tester to my TestFlight group"

## Requirements

- Valid Apple Developer Program membership
- App Store Connect access
- API key with appropriate permissions (typically App Manager or Admin)

## License

MIT License - see LICENSE file for details

## Contributing

Contributions welcome! Please read our contributing guidelines and submit pull requests for any improvements.

## Support

- Create an issue for bugs or feature requests
- Check Apple's App Store Connect API documentation for API-specific questions
