import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Background, Controls, ReactFlow, type Edge, type Node } from "@xyflow/react";

type Json = Record<string, unknown>;
type Version = { revision: number; config?: Json; createdAt?: string };
type Mission = { id: string; goal?: string; status: string; agentId?: string; runId?: string; detail?: unknown };
type Event = { eventId: string; sequence: number; type: string; occurredAt?: string; timestamp?: string; payload?: unknown };
type Integration = { id: string; status: string; reason?: string };
type Page = "mission" | "architect" | "integrations" | "replay";

const groups = ["World Studio", "Core Studio", "Agent Studio", "Integration Hub", "Knowledge Center", "Model Control", "Security Center", "Event Director", "Mission Control", "Version & Presets"];
const terminal = new Set(["completed", "failed", "cancelled", "interrupted", "COMPLETED", "FAILED", "CANCELLED"]);
const object = (value: unknown): Json => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const pretty = (value: unknown) => JSON.stringify(value, null, 2);
const text = (value: unknown, fallback = "Unknown") => typeof value === "string" ? value : fallback;
const errorText = (value: unknown) => value instanceof Error ? value.message : "The request failed.";

function Status({ value }: { value: string }) {
  return <span className={`status ${/connected|completed|applied|ready/.test(value.toLowerCase()) && !/disconnected|not.ready/.test(value.toLowerCase()) ? "good" : ""}`}><span aria-hidden="true">●</span>{value}</span>;
}

export default function App() {
  const [token, setToken] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [page, setPage] = useState<Page>("mission");
  const [group, setGroup] = useState("World Studio");
  const [health, setHealth] = useState<Json>({});
  const [config, setConfig] = useState<Json | null>(null);
  const [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState("");
  const [undo, setUndo] = useState<string[]>([]);
  const [redo, setRedo] = useState<string[]>([]);
  const [validated, setValidated] = useState<string | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [selectedMission, setSelectedMission] = useState("");
  const [events, setEvents] = useState<Event[]>([]);
  const [goal, setGoal] = useState("");
  const [steer, setSteer] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastRead, setLastRead] = useState<string | null>(null);
  const [replayPosition, setReplayPosition] = useState(0);
  const authEpoch = useRef(0);
  const pendingMission = useRef<{ goal: string; requestId: string } | null>(null);

  const api = useCallback(async <T,>(path: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> => {
    if (!token) throw new Error("Connect to the local Gateway first.");
    const response = await fetch(`/nexus/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
      redirect: "error",
    });
    const payload = await response.json().catch(() => ({})) as Json;
    if (!response.ok) {
      const reason = typeof payload.error === "string" ? payload.error : text(object(payload.error).message, text(payload.message, response.statusText));
      throw new Error(`${response.status === 409 ? "Conflict: reload the applied version before retrying. " : ""}${reason} (${response.status})`);
    }
    return payload as T;
  }, [token]);

  const refresh = useCallback(async () => {
    const epoch = authEpoch.current;
    const [nextHealth, nextMissions, nextIntegrations, nextBudget] = await Promise.all([
      api<Json>("/health"), api<{ missions: Mission[] }>("/missions"), api<{ integrations: Integration[] }>("/integrations"), api<Json>("/budget"),
    ]);
    if (epoch !== authEpoch.current) return;
    setHealth({ ...nextHealth, budget: nextBudget }); setMissions(nextMissions.missions ?? []); setIntegrations(nextIntegrations.integrations ?? []);
    setLastRead(new Date().toLocaleTimeString());
  }, [api]);

  const loadConfig = useCallback(async () => {
    const epoch = authEpoch.current;
    const [current, history] = await Promise.all([api<{ revision: number; config: Json }>("/config"), api<{ versions: Version[] } | Version[]>("/config/versions")]);
    if (epoch !== authEpoch.current) return;
    setConfig(current.config); setRevision(current.revision); setDraft(pretty(current.config));
    setVersions(Array.isArray(history) ? history : history.versions ?? []);
    setUndo([]); setRedo([]); setValidated(null);
  }, [api]);

  useEffect(() => {
    if (!token) return;
    void Promise.all([refresh(), loadConfig()]).then(() => setError("")).catch(e => setError(errorText(e)));
    const timer = window.setInterval(() => { void refresh().catch(e => setError(`Live data may be stale: ${errorText(e)}`)); }, 5000);
    return () => window.clearInterval(timer);
  }, [token, refresh, loadConfig]);

  useEffect(() => {
    if (!token || !selectedMission) { setEvents([]); return; }
    let live = true;
    const update = () => api<{ events: Event[] }>(`/events?streamId=${encodeURIComponent(selectedMission)}&after=0`)
      .then(data => { if (live) setEvents(data.events ?? []); }).catch(e => { if (live) setError(errorText(e)); });
    void update();
    const timer = window.setInterval(() => { void update(); }, 5000);
    return () => { live = false; window.clearInterval(timer); };
  }, [api, selectedMission, token]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const changeDraft = (next: string) => { setUndo(old => [...old.slice(-49), draft]); setRedo([]); setDraft(next); setValidated(null); };
  const parsedDraft = useMemo(() => { try { return object(JSON.parse(draft)); } catch { return null; } }, [draft]);
  const isDirty = !!config && draft !== pretty(config);
  const configAgents = parsedDraft?.agents ?? config?.agents;
  const agents: Json[] = Array.isArray(configAgents) ? configAgents.map(object) : Object.entries(object(configAgents)).map(([id, value]) => ({ id, ...object(value) }));
  const nodes: Node[] = agents.map((agent, index) => ({
    id: text(agent.id, `agent-${index}`),
    position: { x: index === 0 ? 270 : (index - 1) % 3 * 250 + 20, y: index === 0 ? 30 : 170 + Math.floor((index - 1) / 3) * 120 },
    data: { label: <><span className="node-role">{text(agent.role, text(agent.id, "Agent"))}</span><strong>{text(agent.name, text(agent.id, "Unnamed role"))}</strong><small>{agent.enabled ? "Configured · execution requires Gateway" : "Disabled"}</small></> },
    style: { width: 220 },
  }));
  const edges: Edge[] = []; // No invented delegation edges: a saved role is not evidence of a running relationship.
  const selected = missions.find(m => m.id === selectedMission);
  const engine = object(health.engine);
  const world = object(health.world);
  const budget = object(health.budget);
  const capabilities = object(object(engine.capabilities).features ?? engine.capabilities);
  const desiredWorld = object(parsedDraft?.world);
  const desiredCamera = object(desiredWorld.camera);
  const reducedMotion = desiredWorld.reducedMotion === true;
  const changeWorld = (patch: Json) => { if (parsedDraft) changeDraft(pretty({ ...parsedDraft, world: { ...desiredWorld, ...patch } })); };
  const changeCamera = (patch: Json) => changeWorld({ camera: { ...desiredCamera, ...patch } });
  const shownEvents = page === "replay" ? events.slice(0, replayPosition + 1) : events;
  const approvalIdOf = (event: Event) => text(object(event.payload).approvalId, text(object(event.payload).approval_id, text(object(event.payload).request_id, "")));
  const approvals = events.filter(e => /approval.requested|approval.request$/.test(e.type)).filter(request => approvalIdOf(request) && !events.some(e => /approval.resolved|approval.expired/.test(e.type) && approvalIdOf(e) === approvalIdOf(request)));

  function disconnect() {
    authEpoch.current += 1; setToken(""); setTokenInput(""); setHealth({}); setMissions([]); setIntegrations([]);
    setConfig(null); setDraft(""); setEvents([]); setSelectedMission(""); setLastRead(null); setError(""); setNotice("");
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#main"><span className="brand-symbol" aria-hidden="true">N<span>1</span></span><span>NEXUS <b>ONE</b><small>ARCHITECT CONTROL</small></span></a>
      <div className="nav-label">OPERATIONS</div>
      <nav aria-label="Main navigation">
        <button className={page === "mission" ? "active" : ""} onClick={() => setPage("mission")}><span aria-hidden="true">◈</span> Mission Theater</button>
        <button className={page === "architect" ? "active" : ""} onClick={() => setPage("architect")}><span aria-hidden="true">▦</span> Architect Studio</button>
        <button className={page === "integrations" ? "active" : ""} onClick={() => setPage("integrations")}><span aria-hidden="true">⌘</span> Integration Hub</button>
        <button className={page === "replay" ? "active" : ""} onClick={() => setPage("replay")}><span aria-hidden="true">↺</span> Mission Replay</button>
      </nav>
      <div className="sidebar-world"><span className="eyebrow">WORLD CONNECTION</span><strong>SKY SANCTUARY</strong><Status value={text(world.status, "Unavailable")} /><p>Ready-made Unreal scene pending selection, purchase approval and a verified build.</p><span className="footnote">This interface supports the world.<br />It does not simulate Unreal.</span></div>
      <div className="sidebar-bottom"><span className="small-dot" />PRIVATE GATEWAY<span className="version">v0.1</span></div>
    </aside>

    <div className="workspace">
      <header className="topbar"><div className="breadcrumb">NEXUS ONE <span>/</span> {page === "architect" ? "Architect Studio" : page === "mission" ? "Mission Theater" : page === "replay" ? "Mission Replay" : "Integration Hub"}</div><div className="topbar-actions"><span className="connection-status">{lastRead ? `Last read ${lastRead}` : "No live connection"}</span>{token && <button className="quiet" onClick={disconnect}>Disconnect</button>}<button className="emergency" disabled={!token || busy || capabilities.run_stop !== true} onClick={() => void run(async () => { const result = await api<{ allConfirmed: boolean; results: { requested: boolean }[] }>("/emergency-stop", {}); await refresh(); setNotice(result.allConfirmed ? "All missions checked by the Gateway have an observed terminal state. Completed effects cannot be reversed." : "Emergency stop requested. Some missions remain active or unknown; stopping is not yet confirmed."); })}>■ EMERGENCY STOP</button></div></header>
      <main id="main">
        <div className="page-heading"><div><span className="eyebrow">LIVING CINEMATIC INTELLIGENCE</span><h1>{page === "architect" ? "Shape the system." : page === "mission" ? "Mission Theater" : page === "replay" ? "Review what happened." : "Connected by permission."}</h1><p>{page === "architect" ? "Edit desired configuration. Preview locally. Validate and apply through the Gateway." : page === "mission" ? "Real missions, explicit permissions, evidence at every step." : page === "replay" ? "Read-only event history. Seeking never re-runs a tool or an approval." : "A saved connection is not a verified connection. Test before enabling."}</p></div><div className="heading-state"><Status value={text(engine.status, "Not checked")} /><small>HERMES ENGINE</small></div></div>

        {!token && <form className="connection-panel" onSubmit={event => { event.preventDefault(); authEpoch.current += 1; setToken(tokenInput); setTokenInput(""); }}><div><span className="eyebrow">CONNECT TO YOUR GATEWAY</span><h2>Your controls stay private.</h2><p>Enter the local Gateway access token. It stays in this tab's memory and is cleared on disconnect or reload. Never enter a model-provider API key.</p></div><div className="connect-fields"><label htmlFor="gateway-token">Gateway access token</label><input id="gateway-token" type="password" autoComplete="off" value={tokenInput} onChange={e => setTokenInput(e.target.value)} required /><button className="primary" type="submit">Connect Gateway <span aria-hidden="true">↗</span></button></div></form>}
        {error && <div className="feedback error" role="alert">{error}<button className="quiet" onClick={() => setError("")}>Dismiss</button></div>}
        {notice && <div className="feedback" role="status">{notice}</div>}

        <div className="metrics"><div><span>ENGINE</span><strong>{text(engine.status, "Not checked")}</strong><small>Capability verification required</small></div><div><span>MISSIONS</span><strong>{token && lastRead ? String(missions.length).padStart(2, "0") : "—"}</strong><small>{token && lastRead ? `${missions.filter(m => !terminal.has(m.status)).length} non-terminal` : "No measured activity"}</small></div><div><span>CONFIGURATION</span><strong>{config ? `Revision ${revision}` : "—"}</strong><small>{isDirty ? "Local draft · not applied" : config ? "Loaded from Gateway" : "Awaiting Gateway"}</small></div><div><span>RECORDED AI COST</span><strong>{typeof budget.spentMicroUsd === "number" ? `$${(budget.spentMicroUsd / 1000000).toFixed(2)}` : "Unknown"}</strong><small>{typeof budget.dailyLimitMicroUsd === "number" ? `$${(budget.dailyLimitMicroUsd / 1000000).toFixed(2)} UTC cap · reservation ledger` : "No cost evidence received"}</small></div></div>

        {token && typeof engine.executionStatus === "string" && <div className="feedback" role="status"><span><strong>Execution: {text(engine.executionStatus)}</strong><br />{text(engine.reason, "Gateway execution policy has not been verified.")} Cost values are the reservation ledger; provider billing and GPU charges are separate.</span></div>}

        {(page === "mission" || page === "replay") && <div className="mission-layout"><section className="panel"><div className="panel-title"><div><span className="eyebrow">MISSION CONTROL</span><h2>{page === "replay" ? "Choose a recorded mission" : "Define the objective"}</h2></div><span className="section-number">01</span></div>{page === "mission" && <form onSubmit={e => { e.preventDefault(); void run(async () => { if (!pendingMission.current || pendingMission.current.goal !== goal) pendingMission.current = { goal, requestId: crypto.randomUUID() }; const result = await api<Mission | { mission: Mission }>("/missions", { goal, agentId: "principal", requestId: pendingMission.current.requestId }); pendingMission.current = null; const mission = "mission" in result ? result.mission : result; setSelectedMission(mission.id); setGoal(""); await refresh(); setNotice("Mission accepted by Gateway. Watch observed events for execution evidence."); }); }}><label htmlFor="mission-goal">What should the principal agent accomplish?</label><textarea id="mission-goal" value={goal} onChange={e => setGoal(e.target.value)} rows={4} placeholder="Research a question, compare the evidence and cite the sources…" required maxLength={20000} /><div className="form-note">Hermes executes. Gateway enforces policy. A missing dependency blocks execution.</div><button className="primary" disabled={!token || busy || !goal.trim()} type="submit">Submit mission <span aria-hidden="true">↗</span></button></form>}<div className="mission-list">{missions.length ? missions.map(mission => <button key={mission.id} className={`mission-item ${selectedMission === mission.id ? "selected" : ""}`} onClick={() => { setSelectedMission(mission.id); setReplayPosition(0); }}><strong>{mission.goal ?? mission.id}</strong><Status value={mission.status} /><small>{mission.id}</small></button>) : <div className="empty-state"><span aria-hidden="true">◇</span><h3>No missions loaded</h3><p>Activity appears only after the Gateway returns a persisted mission.</p></div>}</div></section><section className="panel event-panel"><div className="panel-title"><div><span className="eyebrow">{page === "replay" ? "READ-ONLY RECORD" : "OBSERVED EXECUTION"}</span><h2>{selected ? selected.goal ?? "Mission details" : "The evidence stream"}</h2></div><span className="section-number">02</span></div>{selected && <><dl className="mission-meta"><div><dt>Mission</dt><dd>{selected.id}</dd></div><div><dt>Run</dt><dd>{selected.runId ?? "Not assigned"}</dd></div><div><dt>State</dt><dd><Status value={selected.status} /></dd></div></dl>{page === "mission" && <div className="mission-actions"><button disabled={!token || busy || !selected.runId || capabilities.run_stop !== true || terminal.has(selected.status)} onClick={() => void run(async () => { await api(`/missions/${encodeURIComponent(selected.id)}/stop`, {}); await refresh(); setNotice("Stop requested. Execution is not confirmed stopped until a terminal state is observed."); })}>■ Request stop</button><form onSubmit={e => { e.preventDefault(); void run(async () => { await api(`/missions/${encodeURIComponent(selected.id)}/steer`, { input: steer }); setSteer(""); setNotice("Steering requested for the next supported execution boundary; a running tool is not rewritten."); }); }}><input aria-label="Steering instruction" placeholder="Edit direction at the next supported boundary" value={steer} onChange={e => setSteer(e.target.value)} maxLength={10000} /><button disabled={!token || busy || !steer.trim() || terminal.has(selected.status) || !selected.runId || capabilities.run_steer !== true}>Send steer</button></form></div>}{page === "replay" && <div className="replay-controls"><label htmlFor="replay-seek">Event position {Math.min(replayPosition + 1, events.length)} / {events.length}</label><input id="replay-seek" type="range" min={0} max={Math.max(0, events.length - 1)} value={Math.min(replayPosition, Math.max(0, events.length - 1))} onChange={e => setReplayPosition(Number(e.target.value))} disabled={!events.length} /><span className="form-note">Historical view · live actions unavailable</span></div>}</>}
          {page === "mission" && approvals.map(event => { const approval = object(event.payload); const approvalId = text(approval.approvalId, text(approval.approval_id, text(approval.request_id, ""))); return <div className="approval-card" key={event.eventId}><span className="eyebrow">AWAITING PERMISSION</span><h3>{text(approval.tool, "Protected operation")}</h3><pre>{pretty(approval)}</pre><div className="button-row"><button className="primary" disabled={!approvalId || busy || capabilities.run_approval_response !== true} onClick={() => void run(async () => { await api(`/missions/${encodeURIComponent(selectedMission)}/approval`, { approvalId, decision: "once" }); setNotice("Decision submitted for this approval only. Await the observed resolution event."); })}>Approve once</button><button disabled={!approvalId || busy || capabilities.run_approval_response !== true} onClick={() => void run(async () => { await api(`/missions/${encodeURIComponent(selectedMission)}/approval`, { approvalId, decision: "deny" }); setNotice("Denial submitted. Await the observed resolution event."); })}>Deny</button></div></div>; })}
          <div className="event-list">{shownEvents.length ? shownEvents.map(event => <article className="event" key={event.eventId}><span className="event-seq">{String(event.sequence).padStart(2, "0")}</span><div><strong>{event.type}</strong><small>{event.occurredAt ?? event.timestamp ?? "Timestamp unavailable"}</small><details><summary>View recorded payload</summary><pre>{pretty(event.payload)}</pre></details></div></article>) : <div className="empty-state"><span aria-hidden="true">⌁</span><h3>No execution events</h3><p>Select a mission to inspect its recorded history. No synthetic activity is displayed.</p></div>}</div>{selected?.detail !== undefined && <details className="record-detail"><summary>Stored mission details / results</summary><pre>{pretty(selected.detail)}</pre></details>}</section></div>}

        {page === "architect" && <><div className="studio-tabs" aria-label="Configuration groups">{groups.map(name => <button key={name} className={group === name ? "active" : ""} onClick={() => setGroup(name)}>{name}</button>)}</div><section className="panel role-map"><div className="panel-title"><div><span className="eyebrow">{isDirty ? "LOCAL DRAFT PREVIEW" : "DESIRED CONFIGURATION"}</span><h2>Agent roles & configuration</h2><p>Configured roles, not live agents. This view does not execute or invent delegation paths.</p></div><Status value={isDirty ? "Preview · not applied" : "Configuration view"} /></div><div className="flow-frame">{nodes.length ? <ReactFlow key={revision + draft.length} nodes={nodes} edges={edges} nodesDraggable nodesConnectable={false} edgesReconnectable={false} fitView minZoom={0.4} maxZoom={1.5} colorMode="dark" proOptions={{ hideAttribution: true }}><Background color="#263143" gap={24} /><Controls showInteractive={false} /></ReactFlow> : <div className="empty-state"><h3>No role configuration loaded</h3><p>Connect the Gateway to inspect configured agents.</p></div>}</div></section><div className="config-layout"><section className="panel"><div className="panel-title"><div><span className="eyebrow">EDIT → PREVIEW → VALIDATE → APPLY</span><h2>{group}</h2></div><Status value={isDirty ? "Draft" : config ? "Loaded" : "Not loaded"} /></div>{group === "World Studio" && <fieldset className="world-controls" disabled={!config || busy}><legend>Desired world · local draft</legend><label>Scene<select value={text(desiredWorld.scene, "SKY_SANCTUARY")} onChange={e => changeWorld({ scene: e.target.value })}><option value="SKY_SANCTUARY">Sky Sanctuary</option><option value="FUTURE_MEGACITY">Future Megacity</option><option value="COSMIC_OBSERVATORY">Cosmic Observatory</option></select></label><label>Visual preset<select value={text(desiredWorld.preset, "Calm")} onChange={e => changeWorld({ preset: e.target.value })}>{["Calm", "Executive", "Analytical", "Explorative"].map(value => <option key={value}>{value}</option>)}</select></label><label>Quality target<select value={text(desiredWorld.quality, "Balanced")} onChange={e => changeWorld({ quality: e.target.value })}>{["Cinematic", "Balanced", "Performance"].map(value => <option key={value}>{value}</option>)}</select></label><label>Camera mode<select value={text(desiredCamera.mode, "cinematic")} onChange={e => changeCamera({ mode: e.target.value })}><option value="cinematic">Cinematic</option><option value="free">Free camera</option></select></label><label className="check-label"><input type="checkbox" checked={reducedMotion} onChange={e => changeWorld({ reducedMotion: e.target.checked })} />Reduced motion</label><label className="check-label"><input type="checkbox" checked={desiredCamera.autoFocus === true} onChange={e => changeCamera({ autoFocus: e.target.checked })} />Auto focus</label><p className="form-note">These are desired values. Apply persists them; Unreal must report observed application separately. Changing scene does not create an agent session.</p></fieldset>}<p className="muted">The complete desired configuration is edited below. Secret references are allowed; secret values are rejected by the Gateway. Runtime state stays separate.</p><label htmlFor="config-json">Desired configuration · JSON</label><textarea id="config-json" className="json-editor" spellCheck={false} value={draft} onChange={e => changeDraft(e.target.value)} rows={18} disabled={!config || busy} /><div className="button-row"><button disabled={!undo.length || busy} onClick={() => { setRedo(old => [...old, draft]); setDraft(undo[undo.length - 1]); setUndo(old => old.slice(0, -1)); setValidated(null); }}>↶ Undo</button><button disabled={!redo.length || busy} onClick={() => { setUndo(old => [...old, draft]); setDraft(redo[redo.length - 1]); setRedo(old => old.slice(0, -1)); setValidated(null); }}>↷ Redo</button><button disabled={!token || busy || !parsedDraft} onClick={() => void run(async () => { await api("/config/validate", { config: JSON.parse(draft) }); setValidated(draft); setNotice("Gateway validation passed. Changes are still a local draft until Apply succeeds."); })}>Validate</button><button className="primary" disabled={!token || busy || validated !== draft || !isDirty} onClick={() => void run(async () => { const result = await api<{ revision: number; config: Json; application?: unknown }>("/config/apply", { config: JSON.parse(draft), expectedRevision: revision }); await loadConfig(); await refresh(); setNotice(`Desired configuration saved as revision ${result.revision}. Engine/world application is reported separately; saving does not prove the world changed.`); })}>Apply revision</button><button className="quiet" disabled={!token || busy} onClick={() => void run(loadConfig)}>Reload applied</button></div><small className="form-note">Undo/redo only affects this draft. Restore creates a new revision; neither reverses external tool effects.</small></section><aside className="panel"><span className="eyebrow">LOCAL VISUAL PREVIEW</span><h2>Preview without side effects.</h2><div className="preview-swatch" aria-label="Static gold and navy style preview"><div className="swatch-line" /><span>PREVIEW</span><strong>NEXUS ONE</strong><p>{text(desiredWorld.scene, "SKY_SANCTUARY").replaceAll("_", " ")}</p></div><p className="muted">A static control style preview only. No Unreal world, engine audio or mission execution is simulated.</p><Status value={reducedMotion ? "Reduced motion requested" : "Motion settings in configuration"} /><h3>Version history</h3><div className="version-list">{versions.length ? versions.map(version => <div className="version-row" key={version.revision}><span>Revision {version.revision}<small>{version.createdAt ?? "Gateway version"}</small></span><button disabled={!token || busy || version.revision === revision} onClick={() => void run(async () => { await api("/config/restore", { revision: version.revision, expectedRevision: revision }); await loadConfig(); setNotice("Historical configuration copied into a new revision. External effects were not reversed."); })}>Restore</button></div>) : <p className="muted">No version history loaded.</p>}</div></aside></div></>}

        {page === "integrations" && <section className="panel"><div className="panel-title"><div><span className="eyebrow">EXPLICIT ACCESS · VERIFIED HEALTH</span><h2>Integration registry</h2><p>Provider secrets belong to the server. No credentials are stored in this interface.</p></div><span className="section-number">01</span></div><div className="integration-grid">{integrations.length ? integrations.map(integration => <article className="integration-card" key={integration.id}><div className="integration-icon" aria-hidden="true">⌘</div><h3>{integration.id}</h3><Status value={integration.status} /><p>{integration.reason ?? "No health explanation provided."}</p><button disabled={!token || busy} onClick={() => void run(async () => { const result = await api<Json>(`/integrations/${encodeURIComponent(integration.id)}/test`, {}); await refresh(); setNotice(`Connection test: ${text(result.status, text(object(result.integration).status, "see health result"))}. This test does not grant execution permission.`); })}>Test connection ↗</button></article>) : <div className="empty-state"><h3>No integration evidence loaded</h3><p>Connections are listed only after a Gateway response.</p></div>}</div></section>}

        <footer><span>NEXUS ONE <span className="muted">/</span> Architect Control</span><span>World and intelligence run independently. No synthetic execution.</span></footer>
      </main>
    </div>
  </div>;
}
