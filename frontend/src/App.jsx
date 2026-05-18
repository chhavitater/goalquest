// src/App.jsx  – Root: handles auth state, loads data from real API
import { useState, useEffect, useCallback } from "react";
import Login from "./Login";
import { authApi, goalsApi, usersApi, reportsApi, achievementsApi, checkinsApi, clearToken, hasToken } from "./api";

// ── Tiny UI ────────────────────────────────────────────────────────────────
const Btn = ({ children, onClick, variant = "primary", style = {}, disabled = false, small = false }) => {
  const base = { cursor: disabled ? "not-allowed" : "pointer", border: "none", borderRadius: 8, fontWeight: 600, transition: "all .15s", opacity: disabled ? 0.5 : 1, fontSize: small ? 13 : 14, padding: small ? "6px 14px" : "10px 20px", ...style };
  const v = { primary: { background: "#1d4ed8", color: "#fff" }, danger: { background: "#ef4444", color: "#fff" }, success: { background: "#10b981", color: "#fff" }, ghost: { background: "#f3f4f6", color: "#374151" }, outline: { background: "#fff", color: "#1d4ed8", border: "1.5px solid #1d4ed8" } };
  return <button style={{ ...base, ...v[variant] }} onClick={onClick} disabled={disabled}>{children}</button>;
};
const Card = ({ children, style = {} }) => (
  <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "20px 24px", marginBottom: 16, ...style }}>{children}</div>
);
const Tag = ({ children, color = "#e5e7eb", textColor = "#374151" }) => (
  <span style={{ background: color, color: textColor, padding: "2px 10px", borderRadius: 99, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{children}</span>
);
const Input = ({ label, value, onChange, type = "text", min, max, placeholder, readOnly, required }) => (
  <div style={{ marginBottom: 14 }}>
    {label && <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 4 }}>{label}{required && <span style={{ color: "#ef4444" }}> *</span>}</label>}
    <input type={type} value={value} onChange={onChange} min={min} max={max} placeholder={placeholder} readOnly={readOnly}
      style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, background: readOnly ? "#f9fafb" : "#fff", boxSizing: "border-box" }} />
  </div>
);
const Select = ({ label, value, onChange, options, required }) => (
  <div style={{ marginBottom: 14 }}>
    {label && <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 4 }}>{label}{required && <span style={{ color: "#ef4444" }}> *</span>}</label>}
    <select value={value} onChange={onChange} style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, background: "#fff", boxSizing: "border-box" }}>
      {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
    </select>
  </div>
);
const Modal = ({ title, children, onClose }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
    <div style={{ background: "#fff", borderRadius: 16, width: 560, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", padding: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{title}</h2>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#6b7280" }}>✕</button>
      </div>
      {children}
    </div>
  </div>
);

const THRUST_AREAS = ["Revenue Growth","Cost Optimisation","Customer Experience","People & Culture","Innovation","Operational Excellence","Compliance & Risk","Digital Transformation"];
const UOM_TYPES    = ["Numeric (Min)","Numeric (Max)","% (Min)","% (Max)","Timeline","Zero-based"];
const QUARTERS     = ["Q1","Q2","Q3","Q4"];
const ACTIVE_Q     = import.meta.env.VITE_ACTIVE_QUARTER || "Q2";
const CYCLE_ID     = 1;

function statusColor(s) { return s==="approved"?"#10b981":s==="pending"?"#f59e0b":s==="rejected"?"#ef4444":"#6b7280"; }
function scoreColor(sc) { return sc===null?"#6b7280":sc>=100?"#10b981":sc>=80?"#f59e0b":"#ef4444"; }
function computeScore(uom, target, actual) {
  if (actual===null||actual===undefined||actual==="") return null;
  const a=parseFloat(actual),t=parseFloat(target);
  if(isNaN(a)||isNaN(t)||t===0) return null;
  if(uom==="Zero-based") return a===0?100:0;
  if(uom==="Timeline") return a<=t?100:Math.max(0,100-(a-t)*10);
  if(uom.includes("Min")) return Math.min(150,Math.round((a/t)*100));
  if(uom.includes("Max")) return a===0?0:Math.min(150,Math.round((t/a)*100));
  return null;
}

// ── EMPLOYEE ───────────────────────────────────────────────────────────────────
function EmployeeView({ user, goals, reload }) {
  const myGoals = goals.filter(g => g.employee_id === user.id);
  const [tab, setTab] = useState("goals");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title:"", thrust_area:THRUST_AREAS[0], description:"", uom:UOM_TYPES[0], target:"", weightage:"" });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const approved = myGoals.filter(g => g.status==="approved");
  const totalW = myGoals.filter(g => g.status!=="rejected").reduce((s,g)=>s+Number(g.weightage),0);

  async function submitGoal() {
    setErr(""); setSaving(true);
    try {
      await goalsApi.create({ ...form, cycle_id: CYCLE_ID, target: Number(form.target), weightage: Number(form.weightage) });
      setForm({ title:"", thrust_area:THRUST_AREAS[0], description:"", uom:UOM_TYPES[0], target:"", weightage:"" });
      setShowAdd(false);
      reload();
    } catch(ex) { setErr(ex.message); }
    finally { setSaving(false); }
  }

  async function saveAchievement(goalId, quarter, actual, status) {
    try { await achievementsApi.upsert(goalId, quarter, actual===""?null:Number(actual), status); reload(); }
    catch(ex) { alert(ex.message); }
  }

  return (
    <div>
      <div style={{ display:"flex", gap:12, marginBottom:24, flexWrap:"wrap" }}>
        {["goals","checkin","summary"].map(t=>(
          <Btn key={t} variant={tab===t?"primary":"ghost"} onClick={()=>setTab(t)}>
            {t==="goals"?"🎯 My Goals":t==="checkin"?"📋 Check-in":"📊 Summary"}
          </Btn>
        ))}
      </div>

      {tab==="goals" && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <span style={{ fontWeight:700 }}>Total: <span style={{ color:totalW===100?"#10b981":"#f59e0b" }}>{totalW}%</span></span>
            {myGoals.filter(g=>g.status!=="rejected").length<8 && <Btn onClick={()=>setShowAdd(true)}>+ Add Goal</Btn>}
          </div>
          {myGoals.length===0 && <Card><p style={{ color:"#6b7280", textAlign:"center" }}>No goals yet. Click "Add Goal" to get started.</p></Card>}
          {myGoals.map(g=>(
            <Card key={g.id}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:8 }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:4, flexWrap:"wrap" }}>
                    <span style={{ fontWeight:700 }}>{g.title}</span>
                    <Tag color={statusColor(g.status)} textColor="#fff">{g.status}</Tag>
                    {g.is_shared && <Tag color="#dbeafe" textColor="#1d4ed8">Shared</Tag>}
                  </div>
                  <div style={{ fontSize:13, color:"#6b7280" }}>{g.thrust_area} · {g.uom} · Target: {g.target} · {g.weightage}%</div>
                  <div style={{ fontSize:13, color:"#374151" }}>{g.description}</div>
                </div>
                {g.status==="pending" && !g.locked_at && (
                  <Btn small variant="danger" onClick={async()=>{ await goalsApi.remove(g.id); reload(); }}>Remove</Btn>
                )}
              </div>
            </Card>
          ))}
          {showAdd && (
            <Modal title="Add New Goal" onClose={()=>{ setShowAdd(false); setErr(""); }}>
              <Select label="Thrust Area" value={form.thrust_area} onChange={e=>setForm(p=>({...p,thrust_area:e.target.value}))} options={THRUST_AREAS} required />
              <Input label="Goal Title" value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} required />
              <Input label="Description" value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} />
              <Select label="Unit of Measurement" value={form.uom} onChange={e=>setForm(p=>({...p,uom:e.target.value}))} options={UOM_TYPES} required />
              <Input label="Target" type="number" value={form.target} onChange={e=>setForm(p=>({...p,target:e.target.value}))} required />
              <Input label="Weightage (%)" type="number" min="10" max="100" value={form.weightage} onChange={e=>setForm(p=>({...p,weightage:e.target.value}))} required />
              {err && <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8, padding:"10px 14px", color:"#dc2626", fontSize:13, marginBottom:12 }}>⚠ {err}</div>}
              <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                <Btn variant="ghost" onClick={()=>{ setShowAdd(false); setErr(""); }}>Cancel</Btn>
                <Btn onClick={submitGoal} disabled={saving}>{saving?"Saving…":"Submit Goal"}</Btn>
              </div>
            </Modal>
          )}
        </div>
      )}

      {tab==="checkin" && (
        <div>
          <div style={{ fontWeight:700, fontSize:16, marginBottom:16 }}>Quarter {ACTIVE_Q} Check-in</div>
          {approved.length===0 && <Card><p style={{ color:"#6b7280", textAlign:"center" }}>No approved goals yet.</p></Card>}
          {approved.map(g=>{
            const ach = (g.achievements||[]).find(a=>a.quarter===ACTIVE_Q);
            return (
              <GoalCheckinCard key={g.id} goal={g} quarter={ACTIVE_Q} achievement={ach} onSave={saveAchievement} />
            );
          })}
        </div>
      )}

      {tab==="summary" && <SummaryView goals={approved} />}
    </div>
  );
}

function GoalCheckinCard({ goal, quarter, achievement, onSave }) {
  const [ach, setAch]       = useState(achievement?.actual ?? "");
  const [status, setStatus] = useState(achievement?.status ?? "Not Started");
  const score = computeScore(goal.uom, goal.target, ach);
  return (
    <Card>
      <div style={{ fontWeight:700, marginBottom:4 }}>{goal.title}</div>
      <div style={{ fontSize:13, color:"#6b7280", marginBottom:12 }}>{goal.thrust_area} · {goal.uom} · Target: {goal.target}</div>
      <div style={{ display:"flex", gap:12, alignItems:"flex-end", flexWrap:"wrap" }}>
        <div style={{ flex:1, minWidth:120 }}>
          <Input label={`Actual (${quarter})`} type="number" value={ach} onChange={e=>setAch(e.target.value)} />
        </div>
        <div style={{ flex:1, minWidth:140 }}>
          <Select label="Status" value={status} onChange={e=>setStatus(e.target.value)} options={["Not Started","On Track","Completed"]} />
        </div>
        {score!==null && <div style={{ fontSize:22, fontWeight:700, color:scoreColor(score), marginBottom:14 }}>{score}%</div>}
        <div style={{ marginBottom:14 }}><Btn small onClick={()=>onSave(goal.id, quarter, ach, status)}>Save</Btn></div>
      </div>
      {(goal.comments||[]).filter(c=>c.quarter===quarter).map(c=>(
        <div key={c.id} style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:8, padding:"8px 12px", fontSize:13, color:"#166534" }}>
          💬 Manager: {c.comment}
        </div>
      ))}
    </Card>
  );
}

function SummaryView({ goals }) {
  if (!goals.length) return <Card><p style={{ color:"#6b7280", textAlign:"center" }}>No approved goals.</p></Card>;
  return (
    <div>
      {QUARTERS.map(q=>{
        const scores = goals.map(g=>{
          const ach=(g.achievements||[]).find(a=>a.quarter===q);
          return { title:g.title, score:computeScore(g.uom,g.target,ach?.actual), weightage:g.weightage };
        });
        const weighted=scores.reduce((s,x)=>x.score!==null?s+(x.score*x.weightage/100):s,0);
        return (
          <Card key={q}>
            <div style={{ fontWeight:700, marginBottom:12 }}>{q} Performance</div>
            {scores.map((s,i)=>(
              <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <span style={{ fontSize:14 }}>{s.title}</span>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:120, height:6, background:"#e5e7eb", borderRadius:4, overflow:"hidden" }}>
                    <div style={{ width:`${Math.min(100,s.score??0)}%`, height:"100%", background:scoreColor(s.score), borderRadius:4 }} />
                  </div>
                  <span style={{ fontSize:13, fontWeight:600, color:scoreColor(s.score), minWidth:40 }}>{s.score!==null?s.score+"%":"—"}</span>
                </div>
              </div>
            ))}
            <div style={{ borderTop:"1px solid #e5e7eb", paddingTop:10, marginTop:8, display:"flex", justifyContent:"flex-end" }}>
              <span style={{ fontWeight:700, color:scoreColor(weighted) }}>Weighted: {weighted.toFixed(1)}%</span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ── MANAGER ────────────────────────────────────────────────────────────────────
function ManagerView({ user, goals, teamMembers, reload }) {
  const [tab, setTab]       = useState("approvals");
  const [showShare, setShowShare] = useState(false);
  const [shareForm, setShareForm] = useState({ title:"", thrust_area:THRUST_AREAS[0], description:"", uom:UOM_TYPES[0], target:"", selectedEmps:[] });

  const pendingGoals  = goals.filter(g=>g.status==="pending");
  const approvedGoals = goals.filter(g=>g.status==="approved");

  async function handleStatus(goalId, status) {
    try { status==="approved"?await goalsApi.approve(goalId):await goalsApi.reject(goalId); reload(); }
    catch(ex) { alert(ex.message); }
  }
  async function saveComment(goalId, quarter, comment) {
    try { await checkinsApi.addComment(goalId, quarter, comment); reload(); }
    catch(ex) { alert(ex.message); }
  }
  async function pushShared() {
    if (!shareForm.title||!shareForm.target||!shareForm.selectedEmps.length) return;
    try {
      await goalsApi.createShared({ ...shareForm, cycle_id:CYCLE_ID, target:Number(shareForm.target), employee_ids:shareForm.selectedEmps });
      setShowShare(false); reload();
    } catch(ex) { alert(ex.message); }
  }

  return (
    <div>
      <div style={{ display:"flex", gap:12, marginBottom:24, flexWrap:"wrap" }}>
        {["approvals","checkin","team"].map(t=>(
          <Btn key={t} variant={tab===t?"primary":"ghost"} onClick={()=>setTab(t)}>
            {t==="approvals"?`📝 Approvals (${pendingGoals.length})`:t==="checkin"?"💬 Check-ins":"👥 Team"}
          </Btn>
        ))}
        <Btn variant="outline" onClick={()=>setShowShare(true)}>📤 Push Shared Goal</Btn>
      </div>

      {tab==="approvals" && (
        <div>
          {pendingGoals.length===0 && <Card><p style={{ color:"#6b7280", textAlign:"center" }}>No pending approvals.</p></Card>}
          {pendingGoals.map(g=>(
            <Card key={g.id}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:8 }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:4 }}>
                    <span style={{ fontWeight:700 }}>{g.title}</span>
                    {g.is_shared && <Tag color="#dbeafe" textColor="#1d4ed8">Shared</Tag>}
                  </div>
                  <div style={{ fontSize:13, color:"#6b7280" }}>{g.employee_name} · {g.thrust_area} · {g.uom} · Target: {g.target} · {g.weightage}%</div>
                  <div style={{ fontSize:13, color:"#374151", marginTop:4 }}>{g.description}</div>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <Btn small variant="success" onClick={()=>handleStatus(g.id,"approved")}>✓ Approve</Btn>
                  <Btn small variant="danger"  onClick={()=>handleStatus(g.id,"rejected")}>✗ Return</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab==="checkin" && (
        <div>
          <div style={{ fontWeight:700, fontSize:16, marginBottom:16 }}>Check-in {ACTIVE_Q}</div>
          {teamMembers.map(emp=>{
            const empGoals=approvedGoals.filter(g=>g.employee_id===emp.id);
            if(!empGoals.length) return null;
            return (
              <div key={emp.id} style={{ marginBottom:20 }}>
                <div style={{ fontWeight:600, fontSize:15, marginBottom:10, color:"#1d4ed8" }}>👤 {emp.name}</div>
                {empGoals.map(g=>{
                  const ach=(g.achievements||[]).find(a=>a.quarter===ACTIVE_Q);
                  const sc=computeScore(g.uom,g.target,ach?.actual);
                  return (
                    <Card key={g.id}>
                      <div style={{ display:"flex", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:600 }}>{g.title}</div>
                          <div style={{ fontSize:13, color:"#6b7280" }}>Target: {g.target} · Actual: {ach?.actual??'—'} · {ach?.status??'Not Started'}</div>
                          {sc!==null && <div style={{ fontSize:13, fontWeight:600, color:scoreColor(sc) }}>Score: {sc}%</div>}
                          {(g.comments||[]).filter(c=>c.quarter===ACTIVE_Q).map(c=>(
                            <div key={c.id} style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:6, padding:"6px 10px", fontSize:12, marginTop:6 }}>💬 {c.comment}</div>
                          ))}
                        </div>
                        <div style={{ minWidth:200 }}>
                          <textarea id={`cm-${g.id}`} rows={2} placeholder="Add check-in comment…"
                            style={{ width:"100%", border:"1px solid #d1d5db", borderRadius:8, padding:"6px 10px", fontSize:13, resize:"none", boxSizing:"border-box" }} />
                          <Btn small style={{ marginTop:6 }} onClick={()=>{
                            const txt=document.getElementById(`cm-${g.id}`)?.value||"";
                            if(txt.trim()) saveComment(g.id, ACTIVE_Q, txt);
                          }}>Save Comment</Btn>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {tab==="team" && (
        <div>
          {teamMembers.map(emp=>{
            const empGoals=goals.filter(g=>g.employee_id===emp.id);
            const approved=empGoals.filter(g=>g.status==="approved");
            const totalW=approved.reduce((s,g)=>s+g.weightage,0);
            return (
              <Card key={emp.id}>
                <div style={{ display:"flex", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
                  <div><div style={{ fontWeight:700 }}>{emp.name}</div><div style={{ fontSize:13, color:"#6b7280" }}>{emp.department}</div></div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    <Tag color="#d1fae5" textColor="#065f46">{approved.length} approved</Tag>
                    <Tag color={totalW===100?"#d1fae5":"#fef3c7"} textColor={totalW===100?"#065f46":"#92400e"}>{totalW}% weight</Tag>
                  </div>
                </div>
                <div style={{ marginTop:12 }}>
                  {approved.map(g=>{
                    const ach=(g.achievements||[]).find(a=>a.quarter===ACTIVE_Q);
                    const sc=computeScore(g.uom,g.target,ach?.actual);
                    return (
                      <div key={g.id} style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                        <span style={{ fontSize:13 }}>{g.title}</span>
                        <span style={{ fontSize:13, fontWeight:600, color:scoreColor(sc) }}>{sc!==null?sc+"%":"No data"}</span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {showShare && (
        <Modal title="Push Shared Goal" onClose={()=>setShowShare(false)}>
          <Select label="Thrust Area" value={shareForm.thrust_area} onChange={e=>setShareForm(p=>({...p,thrust_area:e.target.value}))} options={THRUST_AREAS} required />
          <Input label="Goal Title" value={shareForm.title} onChange={e=>setShareForm(p=>({...p,title:e.target.value}))} required />
          <Input label="Description" value={shareForm.description} onChange={e=>setShareForm(p=>({...p,description:e.target.value}))} />
          <Select label="Unit of Measurement" value={shareForm.uom} onChange={e=>setShareForm(p=>({...p,uom:e.target.value}))} options={UOM_TYPES} required />
          <Input label="Target" type="number" value={shareForm.target} onChange={e=>setShareForm(p=>({...p,target:e.target.value}))} required />
          <div style={{ marginBottom:14 }}>
            <label style={{ display:"block", fontSize:13, fontWeight:600, color:"#374151", marginBottom:6 }}>Select Employees <span style={{ color:"#ef4444" }}>*</span></label>
            {teamMembers.map(e=>(
              <label key={e.id} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6, fontSize:14 }}>
                <input type="checkbox" checked={shareForm.selectedEmps.includes(e.id)}
                  onChange={ev=>setShareForm(p=>({...p, selectedEmps:ev.target.checked?[...p.selectedEmps,e.id]:p.selectedEmps.filter(x=>x!==e.id)}))} />
                {e.name}
              </label>
            ))}
          </div>
          <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
            <Btn variant="ghost" onClick={()=>setShowShare(false)}>Cancel</Btn>
            <Btn onClick={pushShared}>Push Goal</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── ADMIN ──────────────────────────────────────────────────────────────────────
function AdminView({ goals, reload }) {
  const [tab, setTab]   = useState("dashboard");
  const [stats, setStats] = useState(null);
  const [audit, setAudit] = useState([]);

  useEffect(()=>{
    reportsApi.dashboard(CYCLE_ID).then(setStats).catch(()=>{});
    if(tab==="audit") reportsApi.audit().then(setAudit).catch(()=>{});
  },[tab]);

  async function unlock(id) {
    await goalsApi.unlock(id,"Admin exception"); reload();
    reportsApi.dashboard(CYCLE_ID).then(setStats);
  }

  async function exportCsv() {
    const csv = await reportsApi.exportCsv(CYCLE_ID);
    const blob = new Blob([csv],{type:"text/csv"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="goal_report.csv"; a.click();
  }

  return (
    <div>
      <div style={{ display:"flex", gap:12, marginBottom:24, flexWrap:"wrap" }}>
        {["dashboard","goals","audit"].map(t=>(
          <Btn key={t} variant={tab===t?"primary":"ghost"} onClick={()=>setTab(t)}>
            {t==="dashboard"?"📊 Dashboard":t==="goals"?"🎯 All Goals":"🔍 Audit Log"}
          </Btn>
        ))}
        <Btn variant="outline" onClick={exportCsv}>⬇ Export CSV</Btn>
      </div>

      {tab==="dashboard" && stats && (
        <div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:12, marginBottom:24 }}>
            {[
              { label:"Total Goals",       value:stats.total_goals,  color:"#1d4ed8" },
              { label:"Approved",          value:stats.approved,     color:"#10b981" },
              { label:"Pending",           value:stats.pending,      color:"#f59e0b" },
              { label:`${ACTIVE_Q} Done`,  value:`${stats.completion_by_quarter?.[ACTIVE_Q]?.done??0}/${stats.employees}`, color:"#7c3aed" },
            ].map(m=>(
              <div key={m.label} style={{ background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:12, padding:"16px 20px", textAlign:"center" }}>
                <div style={{ fontSize:28, fontWeight:700, color:m.color }}>{m.value}</div>
                <div style={{ fontSize:13, color:"#6b7280", marginTop:4 }}>{m.label}</div>
              </div>
            ))}
          </div>
          <Card>
            <div style={{ fontWeight:700, marginBottom:12 }}>Goal Distribution by Thrust Area</div>
            {Object.entries(stats.by_thrust_area||{}).map(([ta,cnt])=>(
              <div key={ta} style={{ display:"flex", alignItems:"center", gap:12, marginBottom:8 }}>
                <span style={{ minWidth:180, fontSize:13 }}>{ta}</span>
                <div style={{ flex:1, height:8, background:"#e5e7eb", borderRadius:4, overflow:"hidden" }}>
                  <div style={{ width:`${Math.round((cnt/stats.total_goals)*100)}%`, height:"100%", background:"#6366f1", borderRadius:4 }} />
                </div>
                <span style={{ fontSize:13, minWidth:24 }}>{cnt}</span>
              </div>
            ))}
          </Card>
        </div>
      )}

      {tab==="goals" && (
        <div>
          {goals.map(g=>(
            <Card key={g.id}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:8 }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:4, flexWrap:"wrap" }}>
                    <span style={{ fontWeight:700 }}>{g.title}</span>
                    <Tag color={statusColor(g.status)} textColor="#fff">{g.status}</Tag>
                    {g.is_shared && <Tag color="#dbeafe" textColor="#1d4ed8">Shared</Tag>}
                  </div>
                  <div style={{ fontSize:13, color:"#6b7280" }}>{g.employee_name} · {g.thrust_area} · {g.uom} · Target: {g.target} · {g.weightage}%</div>
                  {g.locked_at && <div style={{ fontSize:12, color:"#6b7280", marginTop:2 }}>Locked: {new Date(g.locked_at).toLocaleDateString()}</div>}
                </div>
                {g.status==="approved" && <Btn small variant="outline" onClick={()=>unlock(g.id)}>🔓 Unlock</Btn>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab==="audit" && (
        <div>
          {audit.map(log=>(
            <Card key={log.id} style={{ padding:"12px 16px", marginBottom:8 }}>
              <div style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
                <div style={{ fontSize:12, color:"#6b7280", minWidth:140 }}>{new Date(log.created_at).toLocaleString()}</div>
                <div><span style={{ fontWeight:600, fontSize:13 }}>{log.user_name}</span><span style={{ fontSize:13, color:"#374151" }}> — {log.action} {log.entity_type} #{log.entity_id}</span></div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ROOT ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser]           = useState(null);
  const [goals, setGoals]         = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading]     = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [g, t] = await Promise.all([
        goalsApi.list(CYCLE_ID),
        user?.role !== "employee" ? usersApi.team() : Promise.resolve([]),
      ]);
      setGoals(g);
      setTeamMembers(t);
    } catch {}
  }, [user]);

  useEffect(()=>{
    if(!hasToken()) { setLoading(false); return; }
    authApi.me().then(u=>{ setUser(u); }).catch(()=>setLoading(false));
  },[]);

  useEffect(()=>{
    if(user) { setLoading(true); loadData().finally(()=>setLoading(false)); }
  },[user, loadData]);

  function handleLogin(u) { setUser(u); }
  function handleLogout() { clearToken(); setUser(null); setGoals([]); }

  if (!user) return <Login onLogin={handleLogin} />;

  return (
    <div style={{ minHeight:"100vh", background:"#f8fafc", fontFamily:"'Segoe UI',system-ui,sans-serif" }}>
      <div style={{ background:"#fff", borderBottom:"1px solid #e5e7eb", padding:"0 24px" }}>
        <div style={{ maxWidth:960, margin:"0 auto", display:"flex", justifyContent:"space-between", alignItems:"center", height:60 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:36, height:36, background:"#1d4ed8", borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:700, fontSize:18 }}>⚡</div>
            <div><div style={{ fontWeight:800, fontSize:16 }}>GoalQuest</div><div style={{ fontSize:11, color:"#6b7280" }}>Performance Portal · FY 2025-26</div></div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <span style={{ fontSize:13, color:"#374151", fontWeight:600 }}>{user.name}</span>
            <Tag color="#dbeafe" textColor="#1d4ed8">{user.role}</Tag>
            <Btn small variant="ghost" onClick={handleLogout}>Sign out</Btn>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:960, margin:"0 auto", padding:"24px 16px" }}>
        {loading ? (
          <div style={{ textAlign:"center", padding:60, color:"#6b7280" }}>Loading…</div>
        ) : (
          <>
            {user.role==="employee" && <EmployeeView user={user} goals={goals} reload={loadData} />}
            {user.role==="manager"  && <ManagerView  user={user} goals={goals} teamMembers={teamMembers} reload={loadData} />}
            {user.role==="admin"    && <AdminView    goals={goals} reload={loadData} />}
          </>
        )}
      </div>
    </div>
  );
}
