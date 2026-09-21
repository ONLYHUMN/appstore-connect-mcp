/**
 * HTTP Transport for MCP Server using official MCP SDK
 */

import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { createServer, Server as HttpServer } from 'http'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { InMemoryEventStore } from '@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js'

export interface HttpTransportConfig {
  port: number
  host?: string
  cors?: {
    origin?: string | string[]
    credentials?: boolean
  }
  rateLimit?: {
    windowMs?: number
    max?: number
  }
}

export interface McpServerFactory {
  (): Server
}

export class HttpTransport {
  private app: express.Application
  private server?: HttpServer
  private mcpServerFactory?: McpServerFactory
  private transports = new Map<string, StreamableHTTPServerTransport>()

  constructor(private config: HttpTransportConfig) {
    this.app = express()
    this.setupMiddleware()
    this.setupRoutes()
  }

  private setupMiddleware(): void {
    this.app.set('trust proxy', 1)

    this.app.use(helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }))

    this.app.use(cors({
      origin: this.config.cors?.origin || true,
      credentials: this.config.cors?.credentials || true,
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'mcp-session-id', 'last-event-id']
    }))

    this.app.use(rateLimit({
      windowMs: this.config.rateLimit?.windowMs || 15 * 60 * 1000,
      max: this.config.rateLimit?.max || 1000,
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false
    }))

    this.app.use(express.json({ limit: '10mb' }))
    this.app.use(express.urlencoded({ extended: true }))

    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const timestamp = new Date().toISOString()
      console.log(`${timestamp} ${req.method} ${req.path}`)
      if (req.method === 'POST' && req.path.includes('/mcp')) {
        console.log(`  ↳ MCP Request Body:`, JSON.stringify(req.body, null, 2))
      }
      next()
    })
  }

  private setupRoutes(): void {
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        service: 'appstore-connect-mcp',
        activeSessions: this.transports.size
      })
    })

    this.app.post('/', this.handleMcpPostRequest.bind(this))
    this.app.get('/', this.handleMcpGetRequest.bind(this))
    this.app.delete('/', this.handleMcpDeleteRequest.bind(this))
    this.app.post('/mcp', this.handleMcpPostRequest.bind(this))
    this.app.get('/mcp', this.handleMcpGetRequest.bind(this))
    this.app.delete('/mcp', this.handleMcpDeleteRequest.bind(this))

    this.app.use((err: any, req: Request, res: Response, next: NextFunction) => {
      console.error('HTTP Transport Error:', err)
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' })
      }
    })
  }

  setMcpServerFactory(factory: McpServerFactory): void {
    this.mcpServerFactory = factory
  }

  private async ensureTransport(req: Request): Promise<StreamableHTTPServerTransport> {
    const sessionId = req.headers['mcp-session-id'] as string | undefined

    if (sessionId && this.transports.has(sessionId)) {
      return this.transports.get(sessionId)!
    }
    if (this.transports.has('default')) {
      return this.transports.get('default')!
    }

    const eventStore = new InMemoryEventStore()
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      eventStore,
      onsessioninitialized: undefined
    })

    this.transports.set('default', transport)

    if (!this.mcpServerFactory) {
      throw new Error('MCP server factory not initialized')
    }
    const server = this.mcpServerFactory()
    await server.connect(transport)
    return transport
  }

  private async handleMcpPostRequest(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = req.headers['mcp-session-id'] as string

      if (req.body?.method === 'initialize') {
        const clientInfo = req.body?.params?.clientInfo
        console.log(`📱 MCP Client connecting:`, {
          name: clientInfo?.name || 'unknown',
          version: clientInfo?.version || 'unknown',
          ip: req.ip || req.socket.remoteAddress,
          userAgent: req.headers['user-agent'],
          sessionId: sessionId
        })
      }

      console.log(sessionId ? `Received MCP POST request for session: ${sessionId}` : 'Received MCP POST request')

      let transport: StreamableHTTPServerTransport | undefined

      if (sessionId && this.transports.has(sessionId)) {
        transport = this.transports.get(sessionId)!
      } else if (this.transports.has('default')) {
        transport = this.transports.get('default')!
      }

      if (!transport && (isInitializeRequest(req.body) || this.transports.size === 0)) {
        transport = await this.ensureTransport(req)
        await transport.handleRequest(req, res, req.body)
        return
      }

      if (!transport) {
        transport = await this.ensureTransport(req)
      }

      await transport.handleRequest(req, res, req.body)
    } catch (error) {
      console.error('Error handling MCP POST request:', error)
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        })
      }
    }
  }

  private async handleMcpGetRequest(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = req.headers['mcp-session-id'] as string
      let transport: StreamableHTTPServerTransport | undefined

      if (sessionId && this.transports.has(sessionId)) {
        transport = this.transports.get(sessionId)
      } else if (this.transports.has('default')) {
        transport = this.transports.get('default')
      }

      if (!transport) {
        res.status(400).send('Invalid or missing session ID')
        return
      }

      const lastEventId = req.headers['last-event-id']
      if (lastEventId) {
        console.log(`Client reconnecting with Last-Event-ID: ${lastEventId}`)
      } else {
        console.log(`Establishing new SSE stream for session ${sessionId || 'default'}`)
      }

      await transport.handleRequest(req, res)
    } catch (error) {
      console.error('Error handling MCP GET request:', error)
      if (!res.headersSent) {
        res.status(500).send('Error processing SSE request')
      }
    }
  }

  private async handleMcpDeleteRequest(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = req.headers['mcp-session-id'] as string
      let transport: StreamableHTTPServerTransport | undefined

      if (sessionId && this.transports.has(sessionId)) {
        transport = this.transports.get(sessionId)
      } else if (this.transports.has('default')) {
        transport = this.transports.get('default')
      }

      if (!transport) {
        res.status(400).send('Invalid or missing session ID')
        return
      }

      console.log(`Received session termination request for session ${sessionId || 'default'}`)
      await transport.handleRequest(req, res)
    } catch (error) {
      console.error('Error handling session termination:', error)
      if (!res.headersSent) {
        res.status(500).send('Error processing session termination')
      }
    }
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = createServer(this.app)

        this.server.listen(this.config.port, this.config.host || '0.0.0.0', () => {
          console.log(`🌐 Apple Store Connect MCP HTTP Transport listening on ${this.config.host || '0.0.0.0'}:${this.config.port}`)
          console.log(`📡 MCP endpoint: http://${this.config.host || 'localhost'}:${this.config.port}/mcp`)
          resolve()
        })

        this.server.on('error', reject)
      } catch (error) {
        reject(error)
      }
    })
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        for (const [sessionId, transport] of this.transports) {
          try {
            console.log(`Closing transport for session ${sessionId}`)
            transport.close()
            this.transports.delete(sessionId)
          } catch (error) {
            console.error(`Error closing transport for session ${sessionId}:`, error)
          }
        }

        this.server.close(() => {
          console.log('🔌 Apple Store Connect MCP HTTP Transport stopped')
          resolve()
        })
      } else {
        resolve()
      }
    })
  }
}
