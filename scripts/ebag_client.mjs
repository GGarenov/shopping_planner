// Minimal eBag MCP client with OAuth (authorization code + PKCE, dynamic client registration).
// Tokens are stored in .secrets/ebag_oauth.json. Run `npm run ebag:login` once to sign in;
// after that the refresh token keeps the daily sync working without a browser.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { exec } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { MCP_URL, PATHS, SYNC } from './ebag_config.mjs';

const CALLBACK_PORT = 53682;
const REDIRECT_URL = `http://127.0.0.1:${CALLBACK_PORT}/callback`;

function loadStore() {
  try { return JSON.parse(fs.readFileSync(PATHS.oauth, 'utf8')); } catch { return {}; }
}
function saveStore(store) {
  fs.mkdirSync(path.dirname(PATHS.oauth), { recursive: true });
  fs.writeFileSync(PATHS.oauth, JSON.stringify(store, null, 2), 'utf8');
}

class FileOAuthProvider {
  constructor({ interactive }) { this.interactive = interactive; this.store = loadStore(); }
  get redirectUrl() { return REDIRECT_URL; }
  get clientMetadata() {
    return {
      client_name: 'Shopping Planner price sync',
      redirect_uris: [REDIRECT_URL],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: 'shopping',
    };
  }
  clientInformation() { return this.store.clientInformation; }
  saveClientInformation(info) { this.store.clientInformation = info; saveStore(this.store); }
  tokens() { return this.store.tokens; }
  saveTokens(tokens) { this.store.tokens = { ...tokens, saved_at: new Date().toISOString() }; saveStore(this.store); }
  saveCodeVerifier(v) { this.store.codeVerifier = v; saveStore(this.store); }
  codeVerifier() { return this.store.codeVerifier; }
  invalidateCredentials(scope) {
    if (scope === 'all' || scope === 'tokens') delete this.store.tokens;
    if (scope === 'all' || scope === 'client') delete this.store.clientInformation;
    if (scope === 'all' || scope === 'verifier') delete this.store.codeVerifier;
    saveStore(this.store);
  }
  redirectToAuthorization(url) {
    if (!this.interactive) {
      throw new Error('eBag login required (no valid token). Run: npm run ebag:login');
    }
    console.log('\nOpen this URL to sign in to eBag (a browser window should open):\n' + url.href + '\n');
    const cmd = process.platform === 'win32' ? `start "" "${url.href}"`
      : process.platform === 'darwin' ? `open "${url.href}"` : `xdg-open "${url.href}"`;
    exec(cmd);
  }
}

// Starts the local callback server; returns { code: Promise<string>, stop() }.
function startCallbackServer(timeoutMin = 10) {
  let server, timer;
  const code = new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      const u = new URL(req.url, REDIRECT_URL);
      if (u.pathname !== '/callback') { res.writeHead(404).end(); return; }
      const c = u.searchParams.get('code');
      const error = u.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(c ? '<h3>eBag connected. You can close this tab.</h3>' : `<h3>Login failed: ${error}</h3>`);
      c ? resolve(c) : reject(new Error(`OAuth error: ${error}`));
    });
    server.on('error', reject);
    server.listen(CALLBACK_PORT, '127.0.0.1');
    timer = setTimeout(() => reject(new Error(`Timed out waiting for eBag login (${timeoutMin} min)`)), timeoutMin * 60 * 1000);
  });
  const stop = () => { clearTimeout(timer); server.close(); };
  code.then(stop, stop);
  return { code, stop };
}

export async function connect({ interactive = false } = {}) {
  const provider = new FileOAuthProvider({ interactive });
  const make = () => {
    const client = new Client({ name: 'shopping-planner-sync', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), { authProvider: provider });
    return { client, transport };
  };
  let { client, transport } = make();
  const callback = interactive ? startCallbackServer() : null;
  try {
    await client.connect(transport);
    callback?.stop(); // already had valid tokens
  } catch (err) {
    if (!(err instanceof UnauthorizedError) || !callback) { callback?.stop(); throw err; }
    const code = await callback.code;
    await transport.finishAuth(code);
    ({ client, transport } = make());
    await client.connect(transport);
  }
  return new EbagApi(client);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

export class EbagApi {
  constructor(client) { this.client = client; this.calls = 0; }

  async call(name, args) {
    let lastErr;
    for (let attempt = 1; attempt <= SYNC.retries; attempt++) {
      try {
        if (this.calls++) await sleep(SYNC.delayMs);
        const res = await this.client.callTool({ name, arguments: args });
        if (res.isError) throw new Error(`${name} error: ${res.content?.map(c => c.text).join(' ')}`);
        let data = res.structuredContent;
        if (!data) {
          const text = res.content?.find(c => c.type === 'text')?.text;
          data = text ? JSON.parse(text) : {};
        }
        return data.result ?? data;
      } catch (err) {
        lastErr = err;
        if (attempt >= SYNC.retries) break;
        // eBag rate limit: 429 with "Expected available in N seconds" -> wait that long (+1 s).
        const m = String(err.message).match(/available in (\d+) seconds?/i);
        const waitMs = m ? (Number(m[1]) + 1) * 1000 : (err.code === 429 ? 10000 : 1000 * 2 ** attempt);
        await sleep(waitMs);
      }
    }
    throw lastErr;
  }

  close() { return this.client.close(); }
}
