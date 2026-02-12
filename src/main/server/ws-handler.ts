import { WebSocketServer, WebSocket } from 'ws'
import http from 'http'
import { URL } from 'url'
import { PTYService } from '../services/pty-service'
import { ScrollbackBuffer } from './scrollback'

/**
 * Per-client state tracking which channels the client has subscribed to.
 */
interface ClientState {
  subscriptions: Set<string>
}

/**
 * WebSocketHandler — multiplexed WebSocket server for streaming terminal I/O
 * and file-watcher events to remote clients.
 *
 * Protocol:
 *
 * Client → Server (actions):
 *   { action: "terminal:write",  sessionId, data }
 *   { action: "terminal:resize", sessionId, cols, rows }
 *   { action: "subscribe",       channel }
 *   { action: "unsubscribe",     channel }
 *
 * Server → Client (push, only to subscribed clients):
 *   { channel: "terminal:data:<sessionId>", data }
 *   { channel: "terminal:exit:<sessionId>", exitCode }
 *   { channel: "filewatcher:<event>",       ...payload }
 *
 * Design note: This handler does NOT hook into PTYService/FileWatcherService
 * listeners directly, because those services only support a single listener
 * each. Instead, the ApiServer registers the single listener and forwards
 * data here via the public broadcast*() methods.
 */
export class WebSocketHandler {
  private wss: WebSocketServer
  private clients = new Map<WebSocket, ClientState>()

  constructor(
    server: http.Server,
    private pty: PTYService,
    private scrollback: ScrollbackBuffer,
    private authToken: string
  ) {
    this.wss = new WebSocketServer({ noServer: true })
    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req))

    // Handle HTTP upgrade requests for the /ws path
    server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`)

      // Only handle upgrades to /ws
      if (url.pathname !== '/ws') {
        socket.destroy()
        return
      }

      // Validate auth token from query string
      const token = url.searchParams.get('token')
      if (token !== this.authToken) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return
      }

      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.wss.emit('connection', ws, req)
      })
    })
  }

  // ── Connection lifecycle ─────────────────────────────────

  private handleConnection(ws: WebSocket, _req: http.IncomingMessage): void {
    const clientState: ClientState = { subscriptions: new Set() }
    this.clients.set(ws, clientState)

    ws.on('close', () => {
      this.clients.delete(ws)
    })

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        this.handleMessage(ws, clientState, msg)
      } catch {
        // Ignore malformed messages
      }
    })
  }

  // ── Inbound message dispatch ─────────────────────────────

  private handleMessage(
    ws: WebSocket,
    state: ClientState,
    msg: Record<string, any>
  ): void {
    switch (msg.action) {
      case 'terminal:write':
        if (typeof msg.sessionId === 'string' && typeof msg.data === 'string') {
          this.pty.write(msg.sessionId, msg.data)
        }
        break

      case 'terminal:resize':
        if (
          typeof msg.sessionId === 'string' &&
          typeof msg.cols === 'number' &&
          typeof msg.rows === 'number'
        ) {
          this.pty.resize(msg.sessionId, msg.cols, msg.rows)
        }
        break

      case 'subscribe':
        if (typeof msg.channel === 'string') {
          state.subscriptions.add(msg.channel)
          // When subscribing to a terminal data channel, replay scrollback
          if (msg.channel.startsWith('terminal:data:')) {
            const sessionId = msg.channel.slice('terminal:data:'.length)
            const data = this.scrollback.getScrollback(sessionId)
            if (data) {
              this.sendTo(ws, { channel: msg.channel, data })
            }
          }
        }
        break

      case 'unsubscribe':
        if (typeof msg.channel === 'string') {
          state.subscriptions.delete(msg.channel)
        }
        break
    }
  }

  // ── Public broadcast methods (called by ApiServer) ───────

  /**
   * Broadcast PTY output to all clients subscribed to the terminal data channel.
   */
  broadcastTerminalData(sessionId: string, data: string): void {
    this.broadcast(`terminal:data:${sessionId}`, { data })
  }

  /**
   * Broadcast PTY exit to all clients subscribed to the terminal exit channel.
   */
  broadcastTerminalExit(sessionId: string, exitCode: number): void {
    this.broadcast(`terminal:exit:${sessionId}`, { exitCode })
  }

  /**
   * Broadcast a file-watcher event to all clients subscribed to that channel.
   * @param event - The event name suffix (e.g. "teams-update", "tasks-update", "session-linked")
   * @param data - The event payload
   */
  broadcastFileWatcherEvent(event: string, data: Record<string, any>): void {
    this.broadcast(`filewatcher:${event}`, data)
  }

  // ── Internal helpers ─────────────────────────────────────

  /**
   * Send a JSON message to a specific client.
   */
  private sendTo(ws: WebSocket, message: Record<string, any>): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    }
  }

  /**
   * Broadcast a message to all clients subscribed to the given channel.
   * The message sent includes the channel field merged with the payload.
   */
  private broadcast(channel: string, payload: Record<string, any>): void {
    const message = JSON.stringify({ channel, ...payload })
    for (const [ws, state] of this.clients) {
      if (state.subscriptions.has(channel) && ws.readyState === WebSocket.OPEN) {
        ws.send(message)
      }
    }
  }

  // ── Accessors (for testing) ──────────────────────────────

  /** Number of currently connected clients. */
  get clientCount(): number {
    return this.clients.size
  }

  // ── Shutdown ─────────────────────────────────────────────

  /**
   * Gracefully close all connections and shut down the WebSocket server.
   */
  close(): void {
    for (const [ws] of this.clients) {
      ws.close(1001, 'Server shutting down')
    }
    this.clients.clear()
    this.wss.close()
  }
}
