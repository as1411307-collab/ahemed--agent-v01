import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { TaskTimeline, TimelineNode, TimelineNodeStatus } from "@ahmed/contract";
import { ApiError, getTimeline } from "./api";
import { C } from "./theme";

const POLL_MS = 2000;

const STATUS: Record<TimelineNodeStatus, { color: string; label: string }> = {
  DONE: { color: C.ok, label: "Done" },
  RUNNING: { color: C.gold, label: "Running now" },
  WAITING: { color: "#5B9BF8", label: "Waiting for you" },
  REJECTED: { color: "#E0803C", label: "Rejected" },
  FAILED: { color: C.danger, label: "Failed" },
  NOT_REACHED: { color: "#4A4A4A", label: "Not reached" },
};

const KIND_TAG: Record<TimelineNode["kind"], string> = {
  REQUEST: "REQUEST",
  MODEL: "MODEL",
  TOOL: "TOOL",
  APPROVAL: "APPROVAL",
  DECISION: "DECISION",
  EXECUTION: "EXECUTE",
  VERIFICATION: "VERIFY",
  RECOVERY: "RECOVERY",
  RESULT: "RESULT",
};

function clock(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
}

function durationText(ms: number | null): string {
  if (ms === null) return "";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const m = Math.floor(ms / 60_000);
  return `${m} min ${Math.round((ms % 60_000) / 1000)} s`;
}

/** The node the board follows: the step happening now, or else the last step that was reached. */
function focusIndex(nodes: TimelineNode[]): number {
  const live = nodes.findIndex((n) => n.status === "RUNNING" || n.status === "WAITING");
  if (live >= 0) return live;
  let last = 0;
  nodes.forEach((n, i) => {
    if (n.status !== "NOT_REACHED") last = i;
  });
  return last;
}

export function FlowBoard({ taskId, title, onClose }: { taskId: string; title: string; onClose: () => void }) {
  const [timeline, setTimeline] = useState<TaskTimeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [attempt, setAttempt] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const nodeY = useRef(new Map<string, number>());

  // Poll every 2 s while the task is active; stop as soon as it reaches a final status.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      let active = true;
      try {
        const t = await getTimeline(taskId);
        if (stopped) return;
        setTimeline(t);
        setNow(Date.now());
        setError(null);
        active = t.active;
      } catch (e) {
        if (stopped) return;
        setError(e instanceof ApiError || e instanceof Error ? e.message : "Could not load the flow.");
        // A missing task will not appear later; network errors keep polling.
        if (e instanceof ApiError && (e.status === 404 || e.status === 401)) active = false;
      }
      if (active && !stopped) timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [taskId, attempt]);

  // Follow the live step automatically unless Ahmed scrolled away.
  const nodes = timeline?.nodes ?? [];
  const focus = nodes.length ? nodes[focusIndex(nodes)] : undefined;
  const followKey = `${focus?.id}:${focus?.status}:${nodes.length}`;
  const scrollToFocus = useCallback(() => {
    if (!focus) return;
    const y = nodeY.current.get(focus.id);
    if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - 160), animated: true });
  }, [focus]);
  useEffect(() => {
    if (follow && timeline?.active) {
      const t = setTimeout(scrollToFocus, 60);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followKey, follow, timeline?.active]);

  const active = timeline?.active ?? false;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <View style={s.root}>
        <View style={s.header}>
          <View style={s.flex}>
            <View style={s.titleRow}>
              <Text style={s.title}>Flow</Text>
              {timeline && (
                <View style={[s.livePill, { borderColor: active ? C.gold : C.border }]}>
                  {active && <View style={s.liveDot} />}
                  <Text style={[s.liveText, { color: active ? C.gold : C.muted }]}>
                    {active ? "LIVE" : timeline.status.replace(/_/g, " ")}
                  </Text>
                </View>
              )}
            </View>
            <Text style={s.subtitle} numberOfLines={1}>
              {title || "(file)"}
            </Text>
          </View>
          <Pressable onPress={onClose} style={s.closeBtn} hitSlop={10}>
            <Text style={s.closeText}>Close</Text>
          </Pressable>
        </View>

        <View style={s.legend}>
          {(Object.keys(STATUS) as TimelineNodeStatus[]).map((k) => (
            <View key={k} style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: STATUS[k].color }]} />
              <Text style={s.legendText}>{STATUS[k].label}</Text>
            </View>
          ))}
        </View>

        {error && (
          <View style={s.errorBar}>
            <Text style={s.errorText}>{error}</Text>
            <Pressable onPress={() => setAttempt((n) => n + 1)} style={s.retryBtn}>
              <Text style={s.retryText}>Retry</Text>
            </Pressable>
          </View>
        )}

        {!timeline ? (
          <View style={s.center}>{!error && <ActivityIndicator color={C.gold} />}</View>
        ) : (
          <ScrollView
            ref={scrollRef}
            style={s.flex}
            contentContainerStyle={s.board}
            onScrollBeginDrag={() => setFollow(false)}
          >
            {nodes.map((n, i) => (
              <View key={n.id} onLayout={(e) => nodeY.current.set(n.id, e.nativeEvent.layout.y)}>
                {i > 0 && <Connector to={n} />}
                <NodeCard
                  n={n}
                  now={now}
                  open={expanded === n.id}
                  onPress={() => setExpanded((cur) => (cur === n.id ? null : n.id))}
                />
              </View>
            ))}
            <Text style={s.footer}>
              {active ? "Updating every 2 seconds." : `Finished · updated ${clock(timeline.updated_at)}`}
            </Text>
          </ScrollView>
        )}

        {active && !follow && (
          <Pressable
            style={s.followBtn}
            onPress={() => {
              setFollow(true);
              scrollToFocus();
            }}
          >
            <Text style={s.followText}>Follow live</Text>
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

function Connector({ to }: { to: TimelineNode }) {
  const color = to.status === "NOT_REACHED" ? STATUS.NOT_REACHED.color : C.goldDim;
  return (
    <View style={s.connector}>
      <View style={[s.line, { backgroundColor: color }]} />
      <Text style={[s.arrow, { color }]}>▼</Text>
      {to.loop_back && (
        <View style={s.loopTag}>
          <Text style={s.loopText}>↺ back to the model</Text>
        </View>
      )}
    </View>
  );
}

function NodeCard({ n, now, open, onPress }: { n: TimelineNode; now: number; open: boolean; onPress: () => void }) {
  const st = STATUS[n.status];
  const reached = n.status !== "NOT_REACHED";
  const live = n.status === "RUNNING" || n.status === "WAITING";
  // While a step is still open, show how long it has been running or waiting so far.
  const elapsed = live && n.started_at ? Math.max(0, now - Date.parse(n.started_at)) : n.duration_ms;
  return (
    <Pressable
      onPress={onPress}
      style={[
        s.node,
        { borderColor: reached ? st.color : C.border, borderStyle: reached ? "solid" : "dashed" },
        live && { backgroundColor: C.surface2 },
        !reached && s.nodeDim,
      ]}
    >
      <View style={[s.accent, { backgroundColor: st.color }]} />
      <View style={s.nodeBody}>
        <View style={s.nodeTop}>
          <Text style={s.kind}>{KIND_TAG[n.kind]}</Text>
          <View style={[s.statusPill, { borderColor: st.color }]}>
            {n.status === "RUNNING" && <ActivityIndicator size="small" color={st.color} style={s.spinner} />}
            <Text style={[s.statusText, { color: st.color }]}>{st.label}</Text>
          </View>
        </View>
        <Text style={s.label} numberOfLines={open ? undefined : 1}>
          {n.label}
        </Text>
        {!open && (n.error?.message || n.result_preview) && (
          <Text style={[s.preview, n.error && { color: C.danger }]} numberOfLines={1}>
            {n.error?.message ?? n.result_preview}
          </Text>
        )}
        {reached && <Text style={s.meta}>{[clock(n.started_at), durationText(elapsed)].filter(Boolean).join(" · ")}</Text>}
        {open && (
          <View style={s.details}>
            <Detail k="Started" v={clock(n.started_at)} />
            <Detail k="Ended" v={live ? "still open" : clock(n.ended_at)} />
            <Detail k="Duration" v={durationText(elapsed) || "—"} />
            {n.tool && <Detail k="Tool" v={n.tool} />}
            {n.input_preview && <Detail k="Input" v={n.input_preview} />}
            {n.result_preview && <Detail k="Result" v={n.result_preview} />}
            {n.error && <Detail k="Error" v={`${n.error.code}: ${n.error.message}`} danger />}
            {!reached && <Detail k="Note" v="This step has not happened." />}
          </View>
        )}
      </View>
    </Pressable>
  );
}

function Detail({ k, v, danger }: { k: string; v: string; danger?: boolean }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailKey}>{k}</Text>
      <Text style={[s.detailVal, danger && { color: C.danger }]} selectable>
        {v}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
    paddingTop: Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 24) : 54,
  },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.goldDim,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { color: C.gold, fontSize: 20, fontWeight: "700", letterSpacing: 1 },
  subtitle: { color: C.muted, fontSize: 12, marginTop: 2 },
  livePill: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.gold },
  liveText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  closeBtn: { borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  closeText: { color: C.text, fontSize: 13 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: C.muted, fontSize: 11 },
  errorBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#2A0E0F",
    borderColor: C.danger,
    borderWidth: 1,
    marginHorizontal: 12,
    marginBottom: 6,
    borderRadius: 10,
    padding: 10,
  },
  errorText: { color: C.text, flex: 1, fontSize: 13 },
  retryBtn: { borderColor: C.gold, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  retryText: { color: C.gold, fontWeight: "700" },
  board: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 80 },
  connector: { alignItems: "center", height: 34, justifyContent: "flex-end" },
  line: { position: "absolute", top: 0, bottom: 10, width: 2 },
  arrow: { fontSize: 10, lineHeight: 12 },
  loopTag: {
    position: "absolute",
    left: "50%",
    marginLeft: 14,
    top: 7,
    borderWidth: 1,
    borderColor: C.gold,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 1,
    backgroundColor: C.bg,
  },
  loopText: { color: C.gold, fontSize: 11, fontWeight: "600" },
  node: { flexDirection: "row", borderWidth: 1, borderRadius: 12, backgroundColor: C.surface, overflow: "hidden" },
  nodeDim: { opacity: 0.55 },
  accent: { width: 4 },
  nodeBody: { flex: 1, padding: 12, gap: 3 },
  nodeTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  kind: { color: C.goldDim, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 },
  spinner: { transform: [{ scale: 0.6 }], marginVertical: -6 },
  statusText: { fontSize: 10, fontWeight: "700" },
  label: { color: C.text, fontSize: 15, fontWeight: "600" },
  preview: { color: C.muted, fontSize: 12 },
  meta: { color: C.muted, fontSize: 11 },
  details: { marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, gap: 4 },
  detailRow: { flexDirection: "row", gap: 8 },
  detailKey: { color: C.muted, width: 70, fontSize: 12 },
  detailVal: { color: C.text, flex: 1, fontSize: 12 },
  footer: { color: C.muted, fontSize: 11, textAlign: "center", marginTop: 18 },
  followBtn: {
    position: "absolute",
    bottom: 34,
    alignSelf: "center",
    backgroundColor: C.gold,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  followText: { color: C.bg, fontWeight: "800" },
});
