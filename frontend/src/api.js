// src/api.js  – Centralised API client
const BASE = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

function getToken() {
  return localStorage.getItem("gq_token");
}

async function request(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }

  // CSV export – return raw text
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("text/csv")) return res.text();
  return res.json();
}

const get  = (path)        => request("GET",    path);
const post = (path, body)  => request("POST",   path, body);
const put  = (path, body)  => request("PUT",    path, body);
const patch= (path, body)  => request("PATCH",  path, body);
const del  = (path)        => request("DELETE", path);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  login:  (email, password) => post("/auth/login", { email, password }),
  me:     ()                => get("/auth/me"),
};

// ── Goals ─────────────────────────────────────────────────────────────────────
export const goalsApi = {
  list:       (cycleId = 1)           => get(`/goals?cycle_id=${cycleId}`),
  create:     (data)                   => post("/goals", data),
  createShared:(data)                  => post("/goals/shared", data),
  approve:    (id, weightage)          => patch(`/goals/${id}/status`, { status: "approved", weightage }),
  reject:     (id)                     => patch(`/goals/${id}/status`, { status: "rejected" }),
  unlock:     (id, reason)             => patch(`/goals/${id}/unlock`, { reason }),
  remove:     (id)                     => del(`/goals/${id}`),
};

// ── Achievements ──────────────────────────────────────────────────────────────
export const achievementsApi = {
  upsert: (goalId, quarter, actual, status) =>
    put(`/achievements/${goalId}/${quarter}`, { actual, status }),
  list:   (goalId) => get(`/achievements/${goalId}`),
};

// ── Check-in comments ─────────────────────────────────────────────────────────
export const checkinsApi = {
  addComment: (goalId, quarter, comment) =>
    post(`/checkins/${goalId}/${quarter}`, { comment }),
  list: (goalId) => get(`/checkins/${goalId}`),
};

// ── Reports ───────────────────────────────────────────────────────────────────
export const reportsApi = {
  dashboard:  (cycleId = 1) => get(`/reports/dashboard?cycle_id=${cycleId}`),
  exportCsv:  (cycleId = 1) => get(`/reports/export?cycle_id=${cycleId}`),
  audit:      ()             => get("/reports/audit"),
  team:       (managerId, cycleId = 1) => get(`/reports/team/${managerId}?cycle_id=${cycleId}`),
};

// ── Users ─────────────────────────────────────────────────────────────────────
export const usersApi = {
  team:  (managerId) => get(managerId ? `/users/team?manager_id=${managerId}` : "/users/team"),
  all:   ()          => get("/users"),
};

// ── Token helpers ─────────────────────────────────────────────────────────────
export function saveToken(token) { localStorage.setItem("gq_token", token); }
export function clearToken()     { localStorage.removeItem("gq_token"); }
export function hasToken()       { return !!getToken(); }
