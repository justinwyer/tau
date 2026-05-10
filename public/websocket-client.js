/**
 * WebSocket Client - Handles connection to backend WebSocket server
 */

export class WebSocketClient extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = Infinity;
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 10000;
    this.isIntentionallyClosed = false;
    this.reconnectTimer = null;
    this.connectionState = 'idle';
  }

  connect() {
    if (this.connectionState === 'connecting') return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) return;

    this.isIntentionallyClosed = false;
    this.connectionState = 'connecting';
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    // Close only fully stale sockets before reconnecting
    if (this.ws && (this.ws.readyState === WebSocket.CLOSING || this.ws.readyState === WebSocket.CLOSED)) {
      this.ws = null;
    }
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('[WS] Connected');
      this.reconnectAttempts = 0;
      this.connectionState = 'open';
      this.dispatchEvent(new CustomEvent('connected'));
      // Send the Wave user token (if present) so the server can enrich
      // /connect-wave slash commands with Authorization headers.
      // Never logged on either side; null clears any previously held token.
      this._sendWaveUserToken();
      // Send the Wave origin (location.origin) so the server can auto-fill
      // the URL argument on bare /connect-wave commands. Sent once on connect;
      // origin doesn't change during a session.
      this.ws.send(JSON.stringify({ type: 'set_wave_origin', origin: location.origin }));
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error('[WS] Failed to parse message:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('[WS] Error:', error);
      this.dispatchEvent(new CustomEvent('error', { detail: error }));
    };

    this.ws.onclose = (event) => {
      console.log(`[WS] Disconnected (code=${event.code}, reason=${event.reason || 'n/a'})`);
      this.connectionState = 'closed';
      this.dispatchEvent(new CustomEvent('disconnected'));

      if (!this.isIntentionallyClosed) {
        this.attemptReconnect();
      }
    };
  }

  disconnect() {
    this.isIntentionallyClosed = true;
    this.connectionState = 'closed';
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
    }
  }

  // Force reconnect — resets attempt counter and connects fresh
  forceReconnect() {
    this.reconnectAttempts = 0;
    this.isIntentionallyClosed = false;
    this.connectionState = 'closed';
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try { this.ws.close(1000, 'force reconnect'); } catch (e) {}
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.connect();
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WS] Max reconnection attempts reached');
      this.dispatchEvent(new CustomEvent('reconnectFailed'));
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.maxReconnectDelay, this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1));
    
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.error('[WS] Cannot send, not connected');
    }
  }

  handleMessage(message) {
    // Emit events based on message type
    switch (message.type) {
      case 'event':
        this.dispatchEvent(new CustomEvent('rpcEvent', { detail: message.event }));
        break;
      case 'state':
        this.dispatchEvent(new CustomEvent('stateUpdate', { detail: message }));
        break;
      case 'error':
        this.dispatchEvent(new CustomEvent('serverError', { detail: message }));
        break;
      case 'session_switch':
        this.dispatchEvent(new CustomEvent('sessionSwitch'));
        break;
      case 'mirror_sync':
        this.dispatchEvent(new CustomEvent('mirrorSync', { detail: message }));
        break;
      case 'request_wave_user_token':
        // Server is asking us to re-push the token (e.g. after a pi reload
        // reset module-level state). Re-read from localStorage and send.
        this._sendWaveUserToken();
        break;
      default:
        console.warn('[WS] Unknown message type:', message.type);
    }
  }

  /**
   * Send the Wave user token to the server. Called on connect and whenever
   * localStorage['waveUserToken'] changes. Token is never logged.
   */
  _sendWaveUserToken() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'set_wave_user_token',
        token: localStorage.getItem('waveUserToken') || null,
      }));
    }
  }
}

// Subscribe to cross-tab localStorage changes. Fires when waveUserToken is
// updated (e.g. after login/logout in another Wave tab).
window.addEventListener('storage', (event) => {
  if (event.key === 'waveUserToken' && window._tauWsClient) {
    window._tauWsClient._sendWaveUserToken();
  }
});
