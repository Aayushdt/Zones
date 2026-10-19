import { chromium, type Browser, type BrowserContext, type Page, type Request, type Response, type WebSocket } from '@playwright/test'

export interface TrafficRecord {
  at: string
  direction: 'request' | 'response' | 'ws-send' | 'ws-receive'
  url: string
  status?: number
  payload?: unknown
}

export interface PlayerOptions {
  name: string
  viewport?: { width: number; height: number }
  geolocation?: { latitude: number; longitude: number; accuracy: number }
  denyGeolocation?: boolean
  artifactsDir?: string
}

const defaultLocation = { latitude: 37.7749, longitude: -122.4194, accuracy: 12 }

/** One isolated browser context per player; never share storage between actors. */
export class Player {
  readonly traffic: TrafficRecord[] = []
  readonly consoleErrors: string[] = []
  readonly pageErrors: string[] = []
  readonly statusText: string[] = []
  readonly context: BrowserContext
  readonly page: Page

  private constructor(readonly browser: Browser, readonly options: PlayerOptions, context: BrowserContext, page: Page) {
    this.context = context
    this.page = page
    page.on('request', (request) => this.recordRequest(request))
    page.on('response', (response) => { void this.recordResponse(response) })
    page.on('websocket', (socket) => this.recordSocket(socket))
    page.on('console', (message) => { if (message.type() === 'error') this.consoleErrors.push(message.text()) })
    page.on('pageerror', (error) => this.pageErrors.push(error.message))
  }

  static async launch(options: PlayerOptions): Promise<Player> {
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      viewport: options.viewport ?? { width: 412, height: 915 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
      permissions: options.denyGeolocation ? [] : ['geolocation'],
      geolocation: options.geolocation ?? defaultLocation,
      recordHar: options.artifactsDir ? { path: `${options.artifactsDir}/${safe(options.name)}.har`, mode: 'full', content: 'omit' } : undefined,
    })
    const page = await context.newPage()
    return new Player(browser, options, context, page)
  }

  setLocation(point: { latitude: number; longitude: number; accuracy: number }): Promise<void> {
    return this.context.setGeolocation(point)
  }

  /** Records the visible text exposed by live regions after an action. */
  async recordStatus(): Promise<string> {
    const text = (await this.page.locator('[role="status"], [role="alert"]').allTextContents()).map((x) => x.trim()).filter(Boolean).join('\n')
    this.statusText.push(text)
    return text
  }

  async screenshot(path: string): Promise<void> {
    await this.page.screenshot({ path, fullPage: true, animations: 'disabled' })
  }

  async close(): Promise<void> {
    await this.context.close()
    await this.browser.close()
  }

  private recordRequest(request: Request): void {
    const record: TrafficRecord = { at: new Date().toISOString(), direction: 'request', url: request.url() }
    const body = request.postData()
    if (body) record.payload = parseJson(body)
    this.traffic.push(record)
  }

  private async recordResponse(response: Response): Promise<void> {
    let payload: unknown
    try {
      const contentType = response.headers()['content-type'] ?? ''
      // The API uses JSON; omitting HTML/JS/CSS bodies avoids bloated logs and
      // keeps the recorded payload scope focused on application traffic.
      if (contentType.includes('json')) payload = await response.json()
    } catch { /* A response may be unavailable after navigation or download. */ }
    this.traffic.push({ at: new Date().toISOString(), direction: 'response', url: response.url(), status: response.status(), payload })
  }

  private recordSocket(socket: WebSocket): void {
    socket.on('framesent', ({ payload }) => this.traffic.push({ at: new Date().toISOString(), direction: 'ws-send', url: socket.url(), payload: parseWs(payload) }))
    socket.on('framereceived', ({ payload }) => this.traffic.push({ at: new Date().toISOString(), direction: 'ws-receive', url: socket.url(), payload: parseWs(payload) }))
  }
}

function safe(value: string): string { return value.replace(/[^a-z0-9_-]/gi, '_') }
function parseJson(value: string): unknown { try { return JSON.parse(value) as unknown } catch { return value } }
function parseWs(value: string | Buffer): unknown {
  const text = Buffer.isBuffer(value) ? value.toString('utf8') : value
  return parseJson(text)
}
