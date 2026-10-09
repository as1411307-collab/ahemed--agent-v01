import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { endVoice, getVoice, startVoice } from "./api";
import { createNativeVoice } from "./nativeVoice";
import { VoiceClient, type VoiceView } from "./voiceClient";

export function VoicePanel({ conversationId, onTask, onActiveChange, disabled }: {
  conversationId: string | null; onTask: () => void; onActiveChange: (active: boolean) => void; disabled: boolean;
}) {
  const [view, setView] = useState<VoiceView>({ state: "idle", user_speaking: false, muted: false, transcript: "", error: null });
  const [reduceMotion, setReduceMotion] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const onTaskRef = useRef(onTask); onTaskRef.current = onTask;
  const mounted = useRef(true);
  const client = useRef<VoiceClient | null>(null);
  if (!client.current) client.current = new VoiceClient({ start: startVoice, get: getVoice, end: endVoice }, createNativeVoice,
    (view) => { if (mounted.current) setView(view); }, () => { if (mounted.current) onTaskRef.current(); });
  const active = !["idle", "error", "closed"].includes(view.state);

  useEffect(() => { onActiveChange(active); }, [active, onActiveChange]);
  useEffect(() => {
    mounted.current = true;
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "background") void client.current?.stop();
    });
    const motion = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (mounted.current) setReduceMotion(value); });
    return () => { mounted.current = false; listener.remove(); motion.remove(); void client.current?.stop(); };
  }, []);
  useEffect(() => {
    const pulsing = !reduceMotion && (view.user_speaking || view.state === "speaking");
    const animation = pulsing ? Animated.loop(Animated.sequence([
      Animated.timing(scale, { toValue: 1.14, duration: view.state === "speaking" ? 350 : 500, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 450, useNativeDriver: true }),
    ])) : null;
    animation?.start();
    if (!pulsing) scale.setValue(1);
    return () => animation?.stop();
  }, [view.user_speaking, view.state, reduceMotion, scale]);

  const label = view.state === "connecting" ? "جاري توصيل الصوت" : view.state === "speaking" ? "الوكيل يرد عليك" : view.state === "thinking" ? "الوكيل يعالج طلبك" : view.user_speaking ? "أسمعك" : view.muted ? "الميكروفون مكتوم" : active ? "تقدر تتكلم الآن" : "محادثة صوتية مع وكيلك";
  const color = view.user_speaking ? "#56C8F5" : view.state === "speaking" ? "#D4AF37" : "#8C8C8C";
  return (
    <View style={s.panel}>
      <View style={s.row}>
        <Animated.View accessible accessibilityLabel={label} style={[s.orb, { borderColor: color, transform: [{ scale }] }]}>
          <View style={[s.dot, { backgroundColor: color }]} />
        </Animated.View>
        <View style={s.copy}>
          <Text style={s.title}>{label}</Text>
          <Text style={s.caption}>صوت مولّد بالذكاء الاصطناعي · متصل بنفس المهام والموافقات</Text>
        </View>
      </View>
      {!!view.transcript && active && <Text style={s.transcript} numberOfLines={2}>{view.transcript}</Text>}
      {!!view.error && <Text accessibilityRole="alert" style={s.error}>{view.error}</Text>}
      <View style={s.controls}>
        {active ? <>
          <Pressable accessibilityRole="button" accessibilityLabel={view.muted ? "تشغيل الميكروفون" : "كتم الميكروفون"} onPress={() => client.current?.mute()} disabled={view.state === "connecting"} style={s.button}>
            <Text style={s.buttonText}>{view.muted ? "تشغيل الميكروفون" : "كتم"}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="إنهاء المكالمة وإيقاف الميكروفون" onPress={() => void client.current?.stop()} style={[s.button, s.end]}>
            <Text style={s.buttonText}>إنهاء</Text>
          </Pressable>
        </> : <Pressable accessibilityRole="button" accessibilityLabel="بدء محادثة صوتية مباشرة" disabled={disabled || !conversationId} onPress={() => { if (conversationId) void client.current?.start(conversationId); }} style={[s.button, (disabled || !conversationId) && s.disabled]}>
          <Text style={s.buttonText}>بدء الصوت</Text>
        </Pressable>}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  panel: { backgroundColor: "#101015", marginHorizontal: 14, marginBottom: 8, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: "#2A2A36" },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 14 },
  orb: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, alignItems: "center", justifyContent: "center", backgroundColor: "#19191F" },
  dot: { width: 22, height: 22, borderRadius: 11 },
  copy: { flex: 1 }, title: { color: "#F2F2F2", fontSize: 15, fontWeight: "600", textAlign: "right" },
  caption: { color: "#8C8C8C", fontSize: 11, lineHeight: 17, textAlign: "right", marginTop: 3 },
  transcript: { color: "#56C8F5", textAlign: "right", fontSize: 13, marginTop: 10 },
  error: { color: "#F08A8D", textAlign: "right", marginTop: 8, fontSize: 12 },
  controls: { flexDirection: "row-reverse", gap: 8, marginTop: 12 },
  button: { minHeight: 44, minWidth: 80, backgroundColor: "#292627", borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  buttonText: { color: "#F2F2F2", fontSize: 13, fontWeight: "600" }, end: { backgroundColor: "#57262A" }, disabled: { opacity: 0.4 },
});
