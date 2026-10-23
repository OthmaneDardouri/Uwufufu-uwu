// Read-only connection to a Twitch channel's chat. Uses Twitch's anonymous login
// ("justinfan" nicknames), so no account, OAuth or server is needed: it runs in the streamer's browser.
import { parseIrcLine } from "../core/votes.js";

const URL = "wss://irc-ws.chat.twitch.tv:443";
export const CHANNEL_RE = /^[a-z0-9_]{3,25}$/;

/**
 * connectChat("channel", { onMessage(user, text), onStatus("connecting"|"live"|"retrying"|"closed") })
 * Returns { close() }. Reconnects with backoff if the connection drops.
 */
export function connectChat(channel, { onMessage, onStatus = () => {}, WebSocketImpl = globalThis.WebSocket } = {}) {
  const chan = channel.trim().toLowerCase().replace(/^#/, "");
  if (!CHANNEL_RE.test(chan)) throw new Error(`invalid channel "${channel}"`);
  let ws = null;
  let closed = false;
  let retry = 0;
  let timer = null;

  function open() {
    onStatus(retry ? "retrying" : "connecting");
    ws = new WebSocketImpl(URL);
    ws.onopen = () => {
      ws.send("PASS SCHMOOPIIE");
      ws.send(`NICK justinfan${Math.floor(10000 + Math.random() * 89999)}`);
      ws.send(`JOIN #${chan}`);
    };
    ws.onmessage = (e) => {
      for (const line of String(e.data).split("\r\n")) {
        if (!line) continue;
        if (line.includes(` 366 `)) { retry = 0; onStatus("live"); } // end of NAMES list = joined
        const msg = parseIrcLine(line);
        if (msg?.type === "ping") ws.send(`PONG ${msg.payload}`);
        else if (msg?.type === "message") onMessage(msg.user, msg.text);
      }
    };
    ws.onclose = () => {
      if (closed) return onStatus("closed");
      retry++;
      onStatus("retrying");
      timer = setTimeout(open, Math.min(30_000, 1000 * 2 ** retry));
    };
  }

  open();
  return {
    channel: chan,
    close() {
      closed = true;
      clearTimeout(timer);
      ws?.close();
    },
  };
}
