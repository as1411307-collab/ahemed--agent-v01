import WebSocket from "ws";

export type VoiceEvent = { type: string; [key: string]: unknown };
export interface VoiceCall {
  sdp: string;
  send(event: VoiceEvent): void;
  close(): Promise<void>;
}
export interface VoiceProvider {
  start(sdp: string, onEvent: (event: VoiceEvent) => void, onDisconnect: () => void): Promise<VoiceCall>;
}

export interface OpenAIVoiceOptions {
  apiKey: string;
  model?: string;
  transcriptionModel?: string;
  voice?: string;
}

/** Ready-made WebRTC/VAD/ASR/playback; never a second tool-using agent. */
export function realtimeConfig(opts: OpenAIVoiceOptions): Record<string, unknown> {
  return {
    type: "realtime", model: opts.model ?? "gpt-realtime-2.1",
    instructions: "You are only the speech renderer for AHMED Core. Never answer user audio yourself. Never call tools. Read only the text supplied in a server response request, without adding claims or instructions.",
    output_modalities: ["audio"], tools: [], tool_choice: "none",
    audio: {
      input: {
        transcription: { model: opts.transcriptionModel ?? "gpt-4o-transcribe", language: "ar" },
        noise_reduction: { type: "near_field" },
        turn_detection: { type: "server_vad", threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 650, create_response: false, interrupt_response: false },
      },
      output: { voice: opts.voice ?? "marin" },
    },
  };
}

/** All credentials and session controls stay on the Core; the phone receives SDP only. */
export class OpenAIVoiceProvider implements VoiceProvider {
  constructor(
    private readonly opts: OpenAIVoiceOptions,
    private readonly request: typeof fetch = fetch,
    private readonly createSocket = (url: string, options: WebSocket.ClientOptions) => new WebSocket(url, options),
  ) {}

  async start(sdp: string, onEvent: (event: VoiceEvent) => void, onDisconnect: () => void): Promise<VoiceCall> {
    const form = new FormData();
    form.set("sdp", sdp);
    form.set("session", JSON.stringify(realtimeConfig(this.opts)));
    const response = await this.request("https://api.openai.com/v1/realtime/calls", {
      method: "POST", headers: { Authorization: `Bearer ${this.opts.apiKey}` },
      body: form, signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Voice provider refused session (${response.status}).`);
    const callId = response.headers.get("location")?.split("/").pop();
    if (!callId || !/^rtc_[a-zA-Z0-9_-]+$/.test(callId)) throw new Error("Voice provider returned no valid call ID.");
    let socket: WebSocket | undefined;
    let closing = false;
    const hangup = async () => {
      const r = await this.request(`https://api.openai.com/v1/realtime/calls/${callId}/hangup`, {
        method: "POST", headers: { Authorization: `Bearer ${this.opts.apiKey}` }, signal: AbortSignal.timeout(5_000),
      });
      if (!r.ok && r.status !== 404 && r.status !== 410) throw new Error(`Voice hangup failed (${r.status}).`);
    };
    try {
      const answer = await response.text();
      // Attach before returning the answer so microphone events cannot outrun the Core.
      socket = this.createSocket(`wss://api.openai.com/v1/realtime?call_id=${callId}`, {
        headers: { Authorization: `Bearer ${this.opts.apiKey}` }, handshakeTimeout: 10_000,
        maxPayload: 1024 * 1024,
      });
      const ws = socket;
      ws.on("message", (raw) => {
        try {
          const event = JSON.parse(raw.toString()) as VoiceEvent;
          if (event && typeof event.type === "string") onEvent(event);
        } catch { onDisconnect(); }
      });
      ws.on("error", () => { if (!closing) onDisconnect(); });
      ws.on("close", () => { if (!closing) onDisconnect(); });
      await new Promise<void>((resolve, reject) => {
        ws.once("open", resolve);
        ws.once("error", () => reject(new Error("Could not attach voice server controls.")));
        ws.once("close", () => reject(new Error("Voice controls closed during setup.")));
      });
      return {
        sdp: answer,
        send: (event) => {
          if (ws.readyState !== WebSocket.OPEN) throw new Error("Voice controls are disconnected.");
          ws.send(JSON.stringify(event));
        },
        close: async () => {
          closing = true;
          ws.terminate();
          await hangup();
        },
      };
    } catch {
      closing = true;
      socket?.terminate();
      await hangup().catch(() => {});
      throw new Error("Could not initialize voice server controls.");
    }
  }
}
