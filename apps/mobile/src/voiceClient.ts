import type { VoiceSessionAnswer, VoiceSessionSnapshot, VoiceState } from "@ahmed/contract";

export interface VoiceMedia {
  offer(): Promise<string>;
  accept(sdp: string): Promise<void>;
  connected(): Promise<void>;
  mute(muted: boolean): void;
  close(): void;
}
export interface VoiceApi {
  start(conversationId: string, sdp: string): Promise<VoiceSessionAnswer>;
  get(sessionId: string): Promise<VoiceSessionSnapshot>;
  end(sessionId: string): Promise<unknown>;
}
export interface VoiceView {
  state: "idle" | VoiceState;
  user_speaking: boolean;
  muted: boolean;
  transcript: string;
  error: string | null;
}

/** Resource ownership and race handling are independent of native audio for testing. */
export class VoiceClient {
  private generation = 0;
  private media?: VoiceMedia;
  private session?: VoiceSessionAnswer;
  private timer?: ReturnType<typeof setTimeout>;
  private lastTask = "";
  private view: VoiceView = { state: "idle", user_speaking: false, muted: false, transcript: "", error: null };

  constructor(
    private readonly api: VoiceApi,
    private readonly createMedia: (onFailure: () => void) => Promise<VoiceMedia>,
    private readonly onView: (view: VoiceView) => void,
    private readonly onTask: () => void,
  ) {}

  async start(conversationId: string): Promise<void> {
    if (this.media || this.view.state === "connecting") return;
    const generation = ++this.generation;
    this.lastTask = "";
    this.update({ state: "connecting", muted: false, user_speaking: false, error: null });
    let media: VoiceMedia | undefined;
    let session: VoiceSessionAnswer | undefined;
    try {
      media = await this.createMedia(() => {
        if (generation === this.generation) void this.stop("انقطع اتصال الصوت. تقدر تبدأ مكالمة جديدة.");
      });
      if (generation !== this.generation) { media.close(); return; }
      this.media = media;
      const offer = await media.offer();
      if (generation !== this.generation) { media.close(); return; }
      session = await this.api.start(conversationId, offer);
      if (generation !== this.generation) { await this.release(media, session); return; }
      this.session = session;
      await media.accept(session.sdp);
      if (generation !== this.generation) { await this.release(media, session); return; }
      await media.connected();
      if (generation !== this.generation) { await this.release(media, session); return; }
      this.update({ state: "listening" });
      void this.poll(generation);
    } catch (error) {
      await this.release(media, session);
      if (generation !== this.generation) return;
      this.media = undefined; this.session = undefined;
      if (session) this.onTask();
      this.update({ state: "error", user_speaking: false, error: error instanceof Error ? error.message : "تعذّر تشغيل الصوت." });
    }
  }

  mute(): void {
    if (!this.media) return;
    const muted = !this.view.muted;
    this.media.mute(muted);
    this.update({ muted, user_speaking: muted ? false : this.view.user_speaking });
  }

  async stop(error?: string): Promise<void> {
    ++this.generation;
    clearTimeout(this.timer);
    const media = this.media, session = this.session;
    this.media = undefined; this.session = undefined;
    this.update({ state: error ? "error" : "idle", error: error ?? null, user_speaking: false, muted: false });
    if (session) this.onTask();
    // Release native resources immediately even when the Core is offline.
    await this.release(media, session);
  }

  private async release(media?: VoiceMedia, session?: VoiceSessionAnswer): Promise<void> {
    try { media?.close(); } catch { /* Best-effort native cleanup. */ }
    if (session) await this.api.end(session.session_id).catch(() => {});
  }

  private update(patch: Partial<VoiceView>): void {
    this.view = { ...this.view, ...patch };
    this.onView({ ...this.view });
  }

  private async poll(generation: number): Promise<void> {
    if (generation !== this.generation || !this.session) return;
    try {
      const snapshot = await this.api.get(this.session.session_id);
      if (generation !== this.generation) return;
      if (snapshot.state === "closed" || snapshot.state === "error") {
        await this.stop(snapshot.error ?? (snapshot.state === "closed" ? undefined : "انتهى اتصال الصوت."));
        return;
      }
      this.update({ state: snapshot.state, transcript: snapshot.transcript,
        user_speaking: snapshot.user_speaking && !this.view.muted, error: snapshot.error });
      const taskKey = `${snapshot.task?.task_id ?? ""}:${snapshot.task?.status ?? ""}`;
      if (snapshot.task && taskKey !== this.lastTask) { this.lastTask = taskKey; this.onTask(); }
      this.timer = setTimeout(() => { void this.poll(generation); }, 750);
    } catch {
      if (generation === this.generation) await this.stop("تعذّر الوصول إلى الـCore. تم إيقاف الميكروفون؛ الطلبات المحفوظة تبقى في المحادثة.");
    }
  }
}
