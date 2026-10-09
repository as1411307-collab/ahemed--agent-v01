import { isRunningInExpoGo } from "expo";
import { NativeModules, Platform } from "react-native";
import type { VoiceMedia } from "./voiceClient";

export async function createNativeVoice(onFailure: () => void): Promise<VoiceMedia> {
  if (Platform.OS !== "ios") throw new Error("تجربة الصوت الحالية مخصّصة لـiPhone.");
  if (isRunningInExpoGo() || !NativeModules.WebRTCModule) {
    throw new Error("الصوت يحتاج نسخة Development Build على iPhone. Expo Go يدعم المحادثة النصية فقط هنا.");
  }
  // Load lazily so the existing text/files UI still opens safely in Expo Go.
  const rtc: typeof import("react-native-webrtc") = require("react-native-webrtc");
  const stream = await rtc.mediaDevices.getUserMedia({ audio: true, video: false }).catch(() => {
    throw new Error("تعذّر الوصول للميكروفون. اسمح له من إعدادات iPhone ثم جرّب مجددًا.");
  });
  let allocatedPeer: InstanceType<typeof rtc.RTCPeerConnection> | undefined;
  try {
    const peer = new rtc.RTCPeerConnection({ iceServers: [] });
    allocatedPeer = peer;
    const channel = peer.createDataChannel("oai-events");
    let closed = false;
    let ready = false;
    let resolveReady: (() => void) | undefined;
    let rejectReady: ((error: Error) => void) | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    peer.onconnectionstatechange = () => {
      if (!closed && ["failed", "disconnected", "closed"].includes(peer.connectionState)) onFailure();
    };
    channel.onopen = () => { ready = true; clearTimeout(timeout); resolveReady?.(); };
    channel.onclose = () => { if (!closed) onFailure(); };
    // Receive-only data channel: responses, transcripts and all business rules are server-owned.
    stream.getAudioTracks().forEach((track) => peer.addTrack(track, stream));
    return {
      offer: async () => {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        const sdp = peer.localDescription?.sdp ?? offer.sdp;
        if (!sdp) throw new Error("تعذّر تجهيز اتصال الصوت.");
        return sdp;
      },
      accept: async (sdp) => { await peer.setRemoteDescription(new rtc.RTCSessionDescription({ type: "answer", sdp })); },
      connected: () => closed ? Promise.reject(new Error("Call ended.")) : ready ? Promise.resolve() : new Promise<void>((resolve, reject) => {
        resolveReady = resolve; rejectReady = reject;
        timeout = setTimeout(() => reject(new Error("لم يتصل الصوت. تحقق من شبكة iPhone وإمكانية وصولها إلى الـCore.")), 15_000);
      }),
      mute: (muted) => stream.getAudioTracks().forEach((track) => { track.enabled = !muted; }),
      close: () => {
        if (closed) return;
        closed = true; clearTimeout(timeout);
        rejectReady?.(new Error("Call ended."));
        stream.getTracks().forEach((track) => track.stop());
        channel.close(); peer.close(); stream.release();
      },
    };
  } catch {
    stream.getTracks().forEach((track) => track.stop());
    stream.release(); allocatedPeer?.close();
    throw new Error("تعذّر تشغيل WebRTC في هذه النسخة. أعد بناء Development Build.");
  }
}
