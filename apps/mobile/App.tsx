import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  FINAL_STATUSES,
  type AgentResponse,
  type ApprovalRequest,
  type ConversationMessage,
  type ConversationResponse,
  type ConversationTask,
  type DecisionValue,
  type ResultData,
  type TaskStatus,
} from "@ahmed/contract";
import { FlowBoard } from "./src/FlowBoard";
import { C } from "./src/theme";
import { ApiError, CORE_URL, decide, getConversation, getTask, newId, sendMessage, type PickedFile } from "./src/api";


const STORAGE_KEY = "ahmed.conversation_id";
const POLL_MS = 2000;

const isRunning = (s: TaskStatus | null) => !!s && !FINAL_STATUSES.includes(s) && s !== "WAITING_FOR_APPROVAL";

function statusColor(s: TaskStatus | null): string {
  if (s === "COMPLETED") return C.ok;
  if (s === "FAILED" || s === "REJECTED") return C.danger;
  if (s === "WAITING_FOR_APPROVAL") return C.gold;
  return C.muted;
}

function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return "Something went wrong.";
}

function sizeText(bytes?: number): string {
  if (bytes === undefined) return "";
  return bytes < 1024 * 1024 ? ` · ${Math.max(1, Math.round(bytes / 1024))} KB` : ` · ${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function time(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

interface PendingSend {
  requestId: string;
  text: string;
  file: PickedFile | null;
}

export default function App() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conv, setConv] = useState<ConversationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ text: string; retry: () => void } | null>(null);
  const [text, setText] = useState("");
  const [file, setFile] = useState<PickedFile | null>(null);
  const [sending, setSending] = useState(false);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [showTasks, setShowTasks] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [board, setBoard] = useState<{ taskId: string; title: string } | null>(null);
  const listRef = useRef<FlatList<ConversationMessage>>(null);

  // ---- restore conversation id and state from the Core ----
  const load = useCallback(async (id: string) => {
    try {
      setConv(await getConversation(id));
      setError(null);
    } catch (e) {
      setError({ text: errorText(e), retry: () => void load(id) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      let id = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
      if (!id) {
        id = newId();
        await AsyncStorage.setItem(STORAGE_KEY, id).catch(() => {});
      }
      setConversationId(id);
      await load(id);
    })();
  }, [load]);

  const tasks = conv?.tasks ?? [];
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.task_id, t])), [tasks]);
  const running = tasks.filter((t) => isRunning(t.response.status));
  const approvals = tasks.filter((t) => t.response.response_type === "APPROVAL_REQUEST");

  // ---- poll unfinished tasks every 2 seconds ----
  const runningKey = running.map((t) => `${t.task_id}:${t.response.status}`).join(",");
  useEffect(() => {
    if (!conversationId || !runningKey) return;
    const timer = setInterval(async () => {
      try {
        const latest = await Promise.all(running.map((t) => getTask(t.task_id)));
        if (latest.some((r, i) => r.status !== running[i].response.status)) await load(conversationId);
      } catch {
        // Transient network errors: keep polling.
      }
    }, POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, runningKey, load]);

  useEffect(() => {
    if (conv?.messages.length) setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 50);
  }, [conv?.messages.length]);

  // ---- actions ----
  const doSend = useCallback(
    async (p: PendingSend) => {
      if (!conversationId) {
        setError({ text: "Still connecting to the Core. Try again in a moment.", retry: () => void doSend(p) });
        return;
      }
      setHint(null);
      setSending(true);
      try {
        await sendMessage({ requestId: p.requestId, conversationId, text: p.text, file: p.file });
        setText("");
        setFile(null);
        setError(null);
        await load(conversationId);
      } catch (e) {
        // Retry re-sends the same request_id, so the Core never creates a duplicate task.
        setError({ text: errorText(e), retry: () => void doSend(p) });
      } finally {
        setSending(false);
      }
    },
    [conversationId, load],
  );

  const onSend = () => {
    if (sending) return;
    const t = text.trim();
    if (!t && !file) {
      setHint("Type a message or attach a file first.");
      return;
    }
    void doSend({ requestId: newId(), text: t, file });
  };

  const onPick = async () => {
    setHint(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
      if (res.canceled) return;
      const a = res.assets?.[0];
      if (!a?.uri) throw new Error("The picker returned no file.");
      setFile({ uri: a.uri, name: a.name || "file", mimeType: a.mimeType, size: a.size });
      setError(null);
    } catch (e) {
      setError({ text: `Could not attach the file: ${errorText(e)}`, retry: () => void onPick() });
    }
  };

  const onDecide = async (task: ConversationTask, decision: DecisionValue) => {
    const a = task.response.data as ApprovalRequest;
    if (!conversationId || deciding) return;
    setDeciding(a.action_id);
    try {
      await decide(task.task_id, a.action_id, decision);
      setError(null);
    } catch (e) {
      setError({ text: errorText(e), retry: () => void onDecide(task, decision) });
    } finally {
      setDeciding(null);
      await load(conversationId);
    }
  };

  // ---- render ----
  const latest = tasks[0]?.response;
  const openFlow = (t: ConversationTask) => setBoard({ taskId: t.task_id, title: t.user_message });

  return (
    <View style={s.root}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={s.header}>
          <View style={s.flex}>
            <Text style={s.title}>AHMED Agent</Text>
            <Text style={s.subtitle} numberOfLines={1}>
              {CORE_URL || "Core URL not set"}
            </Text>
          </View>
          {latest?.status && <Badge status={latest.status} />}
          <Pressable onPress={() => setShowTasks((v) => !v)} style={s.headerBtn}>
            <Text style={s.headerBtnText}>Tasks ({tasks.length})</Text>
          </Pressable>
        </View>

        {showTasks && <TaskList tasks={tasks} onOpen={openFlow} />}

        {error && (
          <View style={s.errorBar}>
            <Text style={s.errorText}>{error.text}</Text>
            <Pressable onPress={error.retry} style={s.retryBtn}>
              <Text style={s.retryText}>Retry</Text>
            </Pressable>
          </View>
        )}

        {loading ? (
          <View style={s.center}>
            <ActivityIndicator color={C.gold} />
            <Text style={s.muted}>Connecting to the Core…</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            style={s.flex}
            contentContainerStyle={s.list}
            data={conv?.messages ?? []}
            keyExtractor={(m) => m.id}
            ListEmptyComponent={
              <Text style={[s.muted, s.emptyText]}>Attach a file and ask me to summarize it, or send a message.</Text>
            }
            renderItem={({ item }) => {
              const task = item.task_id ? taskById.get(item.task_id) : undefined;
              return <Bubble m={item} task={task} onOpenFlow={task && item.role === "user" ? () => openFlow(task) : undefined} />;
            }}
          />
        )}

        {running.length > 0 && (
          <View style={s.runningRow}>
            <ActivityIndicator color={C.gold} size="small" />
            <Text style={s.muted}>Working…</Text>
            <Badge status={running[0].response.status} />
            <View style={s.flex} />
            <Pressable onPress={() => openFlow(running[0])} style={s.flowBtn} hitSlop={8}>
              <Text style={s.flowBtnText}>Watch live ›</Text>
            </Pressable>
          </View>
        )}

        {approvals.map((t) => (
          <ApprovalCard
            key={t.task_id}
            task={t}
            busy={deciding === (t.response.data as ApprovalRequest).action_id}
            onDecide={(d) => void onDecide(t, d)}
          />
        ))}

        {file && (
          <View style={s.fileChip}>
            <Text style={s.fileChipText} numberOfLines={1}>
              📎 {file.name}
              {sizeText(file.size)}
            </Text>
            {!sending && (
              <Pressable onPress={() => setFile(null)} hitSlop={10}>
                <Text style={s.fileChipX}>✕</Text>
              </Pressable>
            )}
          </View>
        )}

        {(sending || hint) && (
          <Text style={[s.hint, hint && !sending ? { color: C.gold } : null]}>
            {sending ? (file ? `Uploading ${file.name}…` : "Sending…") : hint}
          </Text>
        )}

        <View style={s.inputRow}>
          <Pressable onPress={onPick} style={[s.iconBtn, sending && s.disabled]} disabled={sending}>
            <Text style={s.iconBtnText}>📎</Text>
          </Pressable>
          <TextInput
            style={s.input}
            value={text}
            onChangeText={(v) => {
              setText(v);
              if (hint) setHint(null);
            }}
            placeholder={file ? "Optional: what should I do with it?" : "Message"}
            placeholderTextColor={C.muted}
            multiline
          />
          {/* Never a dead button: when there is nothing to send, pressing it explains why. */}
          <Pressable
            onPress={onSend}
            style={[s.sendBtn, (sending || (!text.trim() && !file)) && s.disabled]}
            disabled={sending}
          >
            {sending ? <ActivityIndicator color={C.bg} /> : <Text style={s.sendText}>Send</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      {board && <FlowBoard taskId={board.taskId} title={board.title} onClose={() => setBoard(null)} />}
    </View>
  );
}

function Badge({ status }: { status: TaskStatus | null }) {
  if (!status) return null;
  const color = statusColor(status);
  return (
    <View style={[s.badge, { borderColor: color }]}>
      <Text style={[s.badgeText, { color }]}>{status.replace(/_/g, " ")}</Text>
    </View>
  );
}

function Bubble({ m, task, onOpenFlow }: { m: ConversationMessage; task?: ConversationTask; onOpenFlow?: () => void }) {
  const mine = m.role === "user";
  const r: AgentResponse | undefined = task?.response;
  const result = r?.response_type === "RESULT" || r?.response_type === "ERROR" ? (r.data as ResultData | null) : null;
  const isError = !mine && m.content.startsWith("Error:");
  return (
    <View style={[s.bubble, mine ? s.bubbleMine : s.bubbleAgent, isError && s.bubbleError]}>
      {m.attachments.map((a) => (
        <Text key={a.workspace_path ?? a.name} style={s.attachment}>
          📎 {a.name}
        </Text>
      ))}
      {!!m.content && <Text style={s.bubbleText}>{m.content}</Text>}
      <View style={s.bubbleMeta}>
        <Text style={s.metaText}>{time(m.created_at)}</Text>
        {!mine && result?.verified === true && <Text style={[s.metaText, { color: C.ok }]}>✓ verified</Text>}
        {onOpenFlow && (
          <Pressable onPress={onOpenFlow} hitSlop={8}>
            <Text style={[s.metaText, s.flowLink]}>Flow ›</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function ApprovalCard({
  task,
  busy,
  onDecide,
}: {
  task: ConversationTask;
  busy: boolean;
  onDecide: (d: DecisionValue) => void;
}) {
  const a = task.response.data as ApprovalRequest;
  const minutesLeft = Math.max(0, Math.round((Date.parse(a.expires_at) - Date.now()) / 60000));
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>Approval needed</Text>
      <Text style={s.cardDesc}>{a.description}</Text>
      <Row k="Operation" v={a.operation} />
      <Row k="File" v={a.affected_resource} />
      <Row k="Destination" v={a.destination ?? "—"} />
      <Row k="Tool" v={a.tool} />
      <Row k="Risk" v={a.risk_level.toUpperCase()} danger={a.risk_level === "write"} />
      <Row k="Expires" v={`${time(a.expires_at)} (${minutesLeft} min left)`} />
      <View style={s.cardButtons}>
        <Pressable style={[s.rejectBtn, busy && s.disabled]} disabled={busy} onPress={() => onDecide("REJECT")}>
          <Text style={s.rejectText}>REJECT</Text>
        </Pressable>
        <Pressable style={[s.approveBtn, busy && s.disabled]} disabled={busy} onPress={() => onDecide("APPROVE")}>
          {busy ? <ActivityIndicator color={C.bg} /> : <Text style={s.approveText}>APPROVE</Text>}
        </Pressable>
      </View>
    </View>
  );
}

function Row({ k, v, danger }: { k: string; v: string; danger?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={s.rowKey}>{k}</Text>
      <Text style={[s.rowVal, danger && { color: C.gold }]} numberOfLines={2}>
        {v}
      </Text>
    </View>
  );
}

function TaskList({ tasks, onOpen }: { tasks: ConversationTask[]; onOpen: (t: ConversationTask) => void }) {
  return (
    <ScrollView style={s.taskPanel} contentContainerStyle={s.taskPanelContent}>
      {tasks.length === 0 ? (
        <Text style={s.muted}>No tasks yet.</Text>
      ) : (
        <Text style={s.taskHint}>Tap a task to see its flow.</Text>
      )}
      {tasks.slice(0, 20).map((t) => (
        <Pressable key={t.task_id} style={s.taskRow} onPress={() => onOpen(t)}>
          <Text style={s.taskTime}>{time(t.created_at)}</Text>
          <Text style={s.taskMsg} numberOfLines={1}>
            {t.user_message || "(file)"}
          </Text>
          <Badge status={t.response.status} />
          <Text style={s.flowLink}>›</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
    paddingTop: Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 24) : 54,
  },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.goldDim,
  },
  title: { color: C.gold, fontSize: 20, fontWeight: "700", letterSpacing: 1 },
  subtitle: { color: C.muted, fontSize: 11, marginTop: 2 },
  headerBtn: { borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  headerBtnText: { color: C.text, fontSize: 12 },
  muted: { color: C.muted, fontSize: 13 },
  emptyText: { textAlign: "center", marginTop: 40, paddingHorizontal: 24 },
  list: { padding: 12, gap: 8 },
  bubble: { maxWidth: "86%", borderRadius: 14, padding: 10, borderWidth: 1 },
  bubbleMine: { alignSelf: "flex-end", backgroundColor: C.surface2, borderColor: C.goldDim },
  bubbleAgent: { alignSelf: "flex-start", backgroundColor: C.surface, borderColor: C.border },
  bubbleError: { borderColor: C.danger },
  bubbleText: { color: C.text, fontSize: 15, lineHeight: 21 },
  bubbleMeta: { flexDirection: "row", gap: 8, marginTop: 4, justifyContent: "flex-end" },
  metaText: { color: C.muted, fontSize: 11 },
  attachment: { color: C.gold, fontSize: 13, marginBottom: 4 },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  runningRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 6 },
  errorBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#2A0E0F",
    borderColor: C.danger,
    borderWidth: 1,
    margin: 10,
    borderRadius: 10,
    padding: 10,
  },
  errorText: { color: C.text, flex: 1, fontSize: 13 },
  retryBtn: { borderColor: C.gold, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  retryText: { color: C.gold, fontWeight: "700" },
  card: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 14,
    borderRadius: 14,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.gold,
    gap: 4,
  },
  cardTitle: { color: C.gold, fontWeight: "700", fontSize: 15 },
  cardDesc: { color: C.text, fontSize: 14, marginBottom: 6 },
  row: { flexDirection: "row", gap: 8 },
  rowKey: { color: C.muted, width: 86, fontSize: 13 },
  rowVal: { color: C.text, flex: 1, fontSize: 13 },
  cardButtons: { flexDirection: "row", gap: 10, marginTop: 10 },
  approveBtn: { flex: 1, backgroundColor: C.gold, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  approveText: { color: C.bg, fontWeight: "800", letterSpacing: 1 },
  rejectBtn: { flex: 1, borderColor: C.danger, borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  rejectText: { color: C.danger, fontWeight: "800", letterSpacing: 1 },
  fileChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 12,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.goldDim,
  },
  fileChipText: { color: C.gold, flex: 1 },
  fileChipX: { color: C.muted, fontSize: 16 },
  hint: { color: C.muted, fontSize: 12, marginHorizontal: 16, marginBottom: 4 },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: 10,
    paddingBottom: Platform.OS === "ios" ? 28 : 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
  },
  iconBtnText: { fontSize: 18 },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    color: C.text,
    backgroundColor: C.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
  },
  sendBtn: { height: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: C.gold, justifyContent: "center" },
  sendText: { color: C.bg, fontWeight: "800" },
  disabled: { opacity: 0.4 },
  taskPanel: {
    maxHeight: 260,
    flexGrow: 0,
    margin: 10,
    borderRadius: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  taskPanelContent: { padding: 10, gap: 6 },
  taskHint: { color: C.muted, fontSize: 11 },
  taskRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  flowLink: { color: C.gold, fontWeight: "700" },
  flowBtn: { borderWidth: 1, borderColor: C.gold, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  flowBtnText: { color: C.gold, fontSize: 12, fontWeight: "700" },
  taskTime: { color: C.muted, fontSize: 11, width: 40 },
  taskMsg: { color: C.text, flex: 1, fontSize: 13 },
});
