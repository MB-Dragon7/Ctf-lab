// Base URL of the backend API. Override at build time with VITE_API_URL if the
// backend isn't running on localhost:4000 (e.g. VITE_API_URL=https://api.example.com/api).
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

function getToken() {
  return localStorage.getItem("ctf_token");
}
export function setToken(token) {
  if (token) localStorage.setItem("ctf_token", token);
  else localStorage.removeItem("ctf_token");
}

async function request(path, { method = "GET", body, auth = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  register: (username, email, password) => request("/auth/register", { method: "POST", body: { username, email, password } }),
  login: (username, password) => request("/auth/login", { method: "POST", body: { username, password } }),
  me: () => request("/auth/me", { auth: true }),

  listChallenges: () => request("/challenges", { auth: true }),
  getChallenge: (id) => request(`/challenges/${id}`, { auth: true }),
  submitFlag: (id, flag) => request(`/challenges/${id}/submit`, { method: "POST", body: { flag }, auth: true }),

  leaderboard: () => request("/leaderboard"),

  adminStats: () => request("/admin/stats", { auth: true }),
  adminListChallenges: () => request("/admin/challenges", { auth: true }),
  adminCreateChallenge: (payload) => request("/admin/challenges", { method: "POST", body: payload, auth: true }),
  adminUpdateChallenge: (id, payload) => request(`/admin/challenges/${id}`, { method: "PUT", body: payload, auth: true }),
  adminSetStatus: (id, status) => request(`/admin/challenges/${id}/status`, { method: "PATCH", body: { status }, auth: true }),
  adminDeleteChallenge: (id) => request(`/admin/challenges/${id}`, { method: "DELETE", auth: true }),
};
