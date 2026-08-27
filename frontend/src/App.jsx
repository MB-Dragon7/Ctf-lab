import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Globe, Search, Lock, FileSearch, TerminalSquare, Network, Image as ImageIcon,
  Cpu, Bug, Smartphone, Plug, Cloud, Boxes, Trophy, User, Shield,
  Plus, Pencil, Trash2, Download, CheckCircle2, ChevronRight, Menu,
  X, Flag, Eye, EyeOff, Archive, Music, Paperclip, LayoutDashboard
} from "lucide-react";
import { api, setToken } from "./api.js";
import { getSpecialChallengeByHash } from "./specialChallenges.js";

const C = {
  bg: "#070B0D", bg2: "#0D1317", card: "#111A1F", cardBorder: "#1C282E",
  green: "#00FF88", cyan: "#00D9FF", text: "#E8F0F2", muted: "#819099",
  error: "#FF4D6D", warning: "#FFB020",
};
const MONO = "ui-monospace, SFMono-Regular, 'Roboto Mono', Menlo, Consolas, monospace";

const CATEGORIES = [
  { name: "Web Security", icon: Globe }, { name: "OSINT", icon: Search }, { name: "Cryptography", icon: Lock },
  { name: "Digital Forensics", icon: FileSearch }, { name: "Linux", icon: TerminalSquare }, { name: "Networking", icon: Network },
  { name: "Steganography", icon: ImageIcon }, { name: "Reverse Engineering", icon: Cpu }, { name: "Malware Analysis", icon: Bug },
  { name: "Mobile Security", icon: Smartphone }, { name: "API Security", icon: Plug }, { name: "Cloud Security", icon: Cloud },
  { name: "Miscellaneous", icon: Boxes },
];
const DIFFICULTIES = ["Easy", "Medium", "Hard", "Expert"];
const DIFF_COLOR = { Easy: C.green, Medium: C.cyan, Hard: C.warning, Expert: C.error };
const DIFF_DEFAULT_PTS = { Easy: 100, Medium: 200, Hard: 400, Expert: 750 };

function Badge({ children, color, style }) {
  return <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color, border: `1px solid ${color}55`, background: `${color}14`, borderRadius: 6, padding: "3px 8px", display: "inline-block", ...style }}>{children}</span>;
}
function Panel({ children, style, ...rest }) {
  return <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: 20, ...style }} {...rest}>{children}</div>;
}
function PrimaryButton({ children, onClick, style, type, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      fontFamily: MONO, fontWeight: 700, fontSize: 13, letterSpacing: 0.5, textTransform: "uppercase",
      background: type === "danger" ? C.error : type === "ghost" ? "transparent" : C.green,
      color: type === "ghost" ? C.text : "#04140C",
      border: type === "ghost" ? `1px solid ${C.cardBorder}` : "none",
      borderRadius: 8, padding: "10px 18px", cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.6 : 1, transition: "opacity .15s", ...style,
    }}>{children}</button>
  );
}
function TextField({ label, value, onChange, placeholder, textarea, type = "text", small }) {
  const Comp = textarea ? "textarea" : "input";
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <div style={{ fontFamily: MONO, fontSize: 11, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>}
      <Comp type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} rows={textarea ? 4 : undefined}
        style={{ width: "100%", background: C.bg2, border: `1px solid ${C.cardBorder}`, borderRadius: 8, color: C.text, fontFamily: MONO, fontSize: small ? 13 : 14, padding: "10px 12px", outline: "none", boxSizing: "border-box", resize: textarea ? "vertical" : undefined }} />
    </div>
  );
}
function SelectField({ label, value, onChange, options }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <div style={{ fontFamily: MONO, fontSize: 11, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>}
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", background: C.bg2, border: `1px solid ${C.cardBorder}`, borderRadius: 8, color: C.text, fontFamily: MONO, fontSize: 14, padding: "10px 12px", outline: "none" }}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
function SectionLabel({ children }) {
  return <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.green, marginBottom: 10, fontWeight: 700 }}>{children}</div>;
}
function StatCard({ label, value, color }) {
  return <Panel style={{ padding: 16 }}><div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", marginBottom: 6 }}>{label}</div><div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div></Panel>;
}
function Toast({ toast }) {
  if (!toast) return null;
  const color = toast.type === "error" ? C.error : toast.type === "warn" ? C.warning : C.green;
  return <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 200, background: C.card, border: `1px solid ${color}`, color, fontFamily: MONO, fontSize: 13, padding: "12px 20px", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>{toast.text}</div>;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [view, setView] = useState("home");
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [activeSpecial, setActiveSpecial] = useState(null);
  const [challenges, setChallenges] = useState([]);
  const [adminChallenges, setAdminChallenges] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [adminStats, setAdminStats] = useState(null);
  const [toast, setToastState] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [apiDown, setApiDown] = useState(false);

  const showToast = useCallback((text, type = "ok") => {
    setToastState({ text, type });
    setTimeout(() => setToastState(null), 2600);
  }, []);

  const refreshChallenges = useCallback(async () => {
    try { const { challenges } = await api.listChallenges(); setChallenges(challenges); setApiDown(false); }
    catch (e) { setApiDown(true); }
  }, []);
  const refreshLeaderboard = useCallback(async () => {
    try { const { leaderboard } = await api.leaderboard(); setLeaderboard(leaderboard); }
    catch (e) { /* leaderboard is non-critical */ }
  }, []);
  const refreshAdminChallenges = useCallback(async () => {
    try { const { challenges } = await api.adminListChallenges(); setAdminChallenges(challenges); }
    catch (e) { showToast(e.message, "error"); }
  }, [showToast]);
  const refreshAdminStats = useCallback(async () => {
    try { const stats = await api.adminStats(); setAdminStats(stats); }
    catch (e) { /* ignore */ }
  }, []);

  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    const match = getSpecialChallengeByHash(hash);
    if (match) {
      setActiveSpecial(match);
      setView("special");
    }
  }, []);

  useEffect(() => {
    (async () => {
      try { const { user } = await api.me(); setCurrentUser(user); } catch (e) { /* not logged in */ }
      await refreshChallenges();
      await refreshLeaderboard();
      setBooting(false);
    })();
  }, [refreshChallenges, refreshLeaderboard]);

  const goto = (v, id) => { setView(v); setSelectedId(id ?? null); setMenuOpen(false); setProfileOpen(false); window.scrollTo?.(0, 0); };

  async function handleRegister(username, password) {
    try {
      const { token, user } = await api.register(username, "", password);
      setToken(token); setCurrentUser(user); showToast(`Welcome, ${username}.`); goto("dashboard");
    } catch (e) { showToast(e.message, "error"); }
  }
  async function handleLogin(username, password) {
    try {
      const { token, user } = await api.login(username, password);
      setToken(token); setCurrentUser(user); showToast(`Logged in as ${username}.`); goto(user.isAdmin ? "admin" : "dashboard");
    } catch (e) { showToast(e.message, "error"); }
  }
  function handleLogout() {
    setToken(null); setCurrentUser(null); showToast("Logged out."); goto("home");
  }

  async function handleSubmitFlag(challenge, guess) {
    try {
      const result = await api.submitFlag(challenge.id, guess);
      if (result.correct) {
        showToast(`Correct — +${result.pointsEarned ?? 0} points.`);
        const { user } = await api.me(); setCurrentUser(user);
        await refreshChallenges(); await refreshLeaderboard();
      } else {
        showToast("Incorrect flag. Try again.", "error");
      }
    } catch (e) { showToast(e.message, "error"); }
  }

  async function handleCreateChallenge(payload) {
    try {
      await api.adminCreateChallenge(payload);
      showToast(payload.status === "Published" ? "Challenge published." : "Draft saved.");
      await refreshAdminChallenges(); await refreshChallenges();
      goto("adminManage");
    } catch (e) { showToast(e.message, "error"); }
  }
  async function handleUpdateChallenge(id, payload) {
    try {
      await api.adminUpdateChallenge(id, payload);
      showToast("Challenge updated.");
      await refreshAdminChallenges(); await refreshChallenges();
      goto("adminManage");
    } catch (e) { showToast(e.message, "error"); }
  }
  async function handleDeleteChallenge(id) {
    try { await api.adminDeleteChallenge(id); showToast("Challenge deleted.", "warn"); await refreshAdminChallenges(); await refreshChallenges(); }
    catch (e) { showToast(e.message, "error"); }
  }
  async function handleArchive(id) {
    try { await api.adminSetStatus(id, "Archived"); showToast("Challenge archived.", "warn"); await refreshAdminChallenges(); await refreshChallenges(); }
    catch (e) { showToast(e.message, "error"); }
  }

  useEffect(() => {
    if (view === "adminManage" || view === "admin") { refreshAdminChallenges(); refreshAdminStats(); }
  }, [view, refreshAdminChallenges, refreshAdminStats]);

  const categoryStats = useMemo(() => {
    const map = {};
    for (const cat of CATEGORIES) map[cat.name] = { count: 0, diffs: {} };
    for (const c of challenges) {
      if (!map[c.category]) map[c.category] = { count: 0, diffs: {} };
      map[c.category].count++;
      map[c.category].diffs[c.difficulty] = (map[c.category].diffs[c.difficulty] || 0) + 1;
    }
    return map;
  }, [challenges]);

  if (booting) {
    return <div style={{ minHeight: "100vh", background: C.bg, color: C.green, fontFamily: MONO, display: "flex", alignItems: "center", justifyContent: "center" }}>[+] Connecting to backend...</div>;
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: MONO }}>
      <NavBar currentUser={currentUser} goto={goto} view={view} menuOpen={menuOpen} setMenuOpen={setMenuOpen} profileOpen={profileOpen} setProfileOpen={setProfileOpen} onLogout={handleLogout} />
      {apiDown && (
        <div style={{ background: `${C.error}18`, borderBottom: `1px solid ${C.error}`, color: C.error, textAlign: "center", fontSize: 12, padding: "8px 10px" }}>
          Can't reach the backend API. Make sure it's running (see README) and refresh.
        </div>
      )}
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "32px 20px 80px" }}>
        {view === "home" && <HomeView goto={goto} categoryStats={categoryStats} challengeCount={challenges.length} />}
        {view === "challenges" && <ChallengesView challenges={challenges} goto={goto} currentUser={currentUser} />}
        {view === "detail" && <ChallengeDetailView challenge={challenges.find((c) => c.id === selectedId)} currentUser={currentUser} goto={goto} onSubmit={handleSubmitFlag} />}
        {view === "leaderboard" && <LeaderboardView leaderboard={leaderboard} />}
        {view === "special" && activeSpecial && <activeSpecial.Component />}
        {view === "rules" && <RulesView />}
        {view === "about" && <AboutView />}
        {view === "auth" && <AuthView onLogin={handleLogin} onRegister={handleRegister} />}
        {view === "dashboard" && (currentUser ? <DashboardView user={currentUser} challenges={challenges} goto={goto} leaderboard={leaderboard} /> : <LockedNotice goto={goto} />)}
        {view === "admin" && (currentUser?.isAdmin ? <AdminHome stats={adminStats} goto={goto} /> : <LockedNotice goto={goto} />)}
        {view === "adminManage" && (currentUser?.isAdmin ? <AdminManage challenges={adminChallenges} goto={goto} setEditingId={setEditingId} onDelete={handleDeleteChallenge} onArchive={handleArchive} /> : <LockedNotice goto={goto} />)}
        {(view === "adminAdd" || view === "adminEdit") && (currentUser?.isAdmin ? <AdminChallengeForm challenge={view === "adminEdit" ? adminChallenges.find((c) => c.id === editingId) : null} onCreate={handleCreateChallenge} onUpdate={handleUpdateChallenge} goto={goto} /> : <LockedNotice goto={goto} />)}
      </div>
      <Footer />
      <Toast toast={toast} />
    </div>
  );
}

function NavBar({ currentUser, goto, view, menuOpen, setMenuOpen, profileOpen, setProfileOpen, onLogout }) {
  const links = [{ id: "home", label: "Home" }, { id: "challenges", label: "Challenges" }, { id: "leaderboard", label: "Leaderboard" }, { id: "rules", label: "Rules" }, { id: "about", label: "About" }];
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(7,11,13,0.92)", borderBottom: `1px solid ${C.cardBorder}`, backdropFilter: "blur(6px)" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div onClick={() => goto("home")} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <Flag size={20} color={C.green} /><span style={{ fontWeight: 700, letterSpacing: 1, color: C.text }}>CTF<span style={{ color: C.green }}>_</span>LAB</span>
        </div>
        <div className="ctf-desktop-links" style={{ display: "flex", gap: 22, alignItems: "center" }}>
          {links.map((l) => <span key={l.id} onClick={() => goto(l.id)} style={{ fontSize: 13, cursor: "pointer", color: view === l.id ? C.green : C.muted, borderBottom: view === l.id ? `2px solid ${C.green}` : "2px solid transparent", paddingBottom: 4 }}>{l.label}</span>)}
          {currentUser?.isAdmin && <span onClick={() => goto("admin")} style={{ fontSize: 13, cursor: "pointer", color: view.startsWith("admin") ? C.cyan : C.muted, display: "flex", alignItems: "center", gap: 4 }}><Shield size={13} /> Admin</span>}
          {currentUser ? (
            <div style={{ position: "relative" }}>
              <div onClick={() => setProfileOpen((p) => !p)} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "6px 10px", border: `1px solid ${C.cardBorder}`, borderRadius: 8, fontSize: 13 }}>
                <User size={14} color={C.cyan} /> {currentUser.username}
              </div>
              {profileOpen && (
                <div style={{ position: "absolute", right: 0, top: 40, background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 8, minWidth: 160, overflow: "hidden" }}>
                  <MenuItem label="Dashboard" onClick={() => goto("dashboard")} />
                  <MenuItem label="My Solves" onClick={() => goto("dashboard")} />
                  <MenuItem label="Logout" onClick={onLogout} danger />
                </div>
              )}
            </div>
          ) : <PrimaryButton onClick={() => goto("auth")} style={{ padding: "8px 14px", fontSize: 12 }}>Login / Register</PrimaryButton>}
        </div>
        <div className="ctf-mobile-toggle" style={{ display: "none", cursor: "pointer" }} onClick={() => setMenuOpen((m) => !m)}>{menuOpen ? <X color={C.text} /> : <Menu color={C.text} />}</div>
      </div>
      {menuOpen && (
        <div style={{ borderTop: `1px solid ${C.cardBorder}`, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          {links.map((l) => <span key={l.id} onClick={() => goto(l.id)} style={{ color: view === l.id ? C.green : C.text, fontSize: 14 }}>{l.label}</span>)}
          {currentUser?.isAdmin && <span onClick={() => goto("admin")} style={{ color: C.cyan, fontSize: 14 }}>Admin Dashboard</span>}
          {currentUser ? (<><span onClick={() => goto("dashboard")} style={{ fontSize: 14 }}>Dashboard</span><span onClick={onLogout} style={{ color: C.error, fontSize: 14 }}>Logout</span></>) : <span onClick={() => goto("auth")} style={{ color: C.green, fontSize: 14 }}>Login / Register</span>}
        </div>
      )}
      <style>{`@media (max-width: 820px) { .ctf-desktop-links { display: none !important; } .ctf-mobile-toggle { display: block !important; } }`}</style>
    </div>
  );
}
function MenuItem({ label, onClick, danger }) {
  return <div onClick={onClick} onMouseEnter={(e) => (e.currentTarget.style.background = C.bg2)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")} style={{ padding: "10px 14px", fontSize: 13, cursor: "pointer", color: danger ? C.error : C.text }}>{label}</div>;
}

function HomeView({ goto, categoryStats, challengeCount }) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 32, alignItems: "center", marginBottom: 56 }}>
        <div>
          <div style={{ color: C.green, fontSize: 12, letterSpacing: 3, marginBottom: 12 }}>[ CYBERSECURITY TRAINING PLATFORM ]</div>
          <h1 style={{ fontSize: 42, lineHeight: 1.1, margin: "0 0 16px", color: C.text, fontWeight: 800 }}>CAPTURE <span style={{ color: C.green }}>THE</span> FLAG</h1>
          <div style={{ color: C.cyan, fontSize: 16, marginBottom: 16 }}>Learn. Hack. Solve. Capture the Flag.</div>
          <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7, marginBottom: 26, maxWidth: 480 }}>Practice cybersecurity through realistic challenges covering web security, networking, cryptography, digital forensics, Linux, OSINT, reverse engineering, and more.</p>
          <div style={{ display: "flex", gap: 12 }}>
            <PrimaryButton onClick={() => goto("challenges")}>Explore Challenges</PrimaryButton>
            <PrimaryButton onClick={() => goto("challenges")} type="ghost">Start CTF</PrimaryButton>
          </div>
        </div>
        <Panel style={{ background: "#050809" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: C.error }} />
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: C.warning }} />
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: C.green }} />
          </div>
          <div style={{ fontSize: 13, lineHeight: 2, color: C.green }}>
            <div style={{ color: C.text }}>$ ./start_ctf.sh</div>
            <div>&nbsp;</div>
            <div>[+] Initializing CTF environment...</div>
            <div>[+] Loading challenges...</div>
            <div>[+] Security modules loaded...</div>
            <div>[+] Ready for exploitation.</div>
            <div>&nbsp;</div>
            <div style={{ color: C.cyan }}>FLAG&#123;your_journey_starts_here&#125;</div>
            <div style={{ color: C.muted, marginTop: 6 }}>_</div>
          </div>
        </Panel>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 18 }}>
        <h2 style={{ fontSize: 18, color: C.text, margin: 0 }}>Challenge Categories</h2>
        <span style={{ color: C.muted, fontSize: 12 }}>{challengeCount} live challenges</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const stat = categoryStats[cat.name] || { count: 0, diffs: {} };
          return (
            <Panel key={cat.name} style={{ cursor: "pointer" }} onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.green)} onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.cardBorder)} onClick={() => goto("challenges")}>
              <Icon size={22} color={C.cyan} />
              <div style={{ fontSize: 14, fontWeight: 700, margin: "12px 0 4px" }}>{cat.name}</div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>{stat.count} challenge{stat.count !== 1 ? "s" : ""}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{Object.entries(stat.diffs).map(([d, n]) => <Badge key={d} color={DIFF_COLOR[d]}>{d} {n}</Badge>)}</div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

function ChallengesView({ challenges, goto, currentUser }) {
  const [category, setCategory] = useState("All");
  const [difficulty, setDifficulty] = useState("All");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("Newest");
  const [solvedFilter, setSolvedFilter] = useState("All");

  const filtered = useMemo(() => {
    let out = challenges.filter((c) =>
      (category === "All" || c.category === category) &&
      (difficulty === "All" || c.difficulty === difficulty) &&
      (search.trim() === "" || c.title.toLowerCase().includes(search.toLowerCase())) &&
      (solvedFilter === "All" || (solvedFilter === "Solved") === !!c.solved)
    );
    if (sortBy === "Newest") out = out.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (sortBy === "Most Solved") out = out.slice().sort((a, b) => b.solveCount - a.solveCount);
    if (sortBy === "Highest Points") out = out.slice().sort((a, b) => b.points - a.points);
    if (sortBy === "Difficulty") out = out.slice().sort((a, b) => DIFFICULTIES.indexOf(a.difficulty) - DIFFICULTIES.indexOf(b.difficulty));
    return out;
  }, [challenges, category, difficulty, search, sortBy, solvedFilter]);

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 18 }}>Challenges</h1>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 22, alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 200px" }}><TextField label="Search" value={search} onChange={setSearch} placeholder="Search challenges..." small /></div>
        <div style={{ minWidth: 160 }}><SelectField label="Category" value={category} onChange={setCategory} options={["All", ...CATEGORIES.map((c) => c.name)]} /></div>
        <div style={{ minWidth: 140 }}><SelectField label="Difficulty" value={difficulty} onChange={setDifficulty} options={["All", ...DIFFICULTIES]} /></div>
        <div style={{ minWidth: 140 }}><SelectField label="Status" value={solvedFilter} onChange={setSolvedFilter} options={["All", "Solved", "Unsolved"]} /></div>
        <div style={{ minWidth: 160 }}><SelectField label="Sort" value={sortBy} onChange={setSortBy} options={["Newest", "Most Solved", "Highest Points", "Difficulty"]} /></div>
      </div>
      {filtered.length === 0 ? <Panel style={{ textAlign: "center", color: C.muted }}>No challenges match those filters.</Panel> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {filtered.map((c) => (
            <Panel key={c.id} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span style={{ fontSize: 11, color: C.muted }}>{c.challengeCode}</span>
                {c.solved && <CheckCircle2 size={16} color={C.green} />}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{c.title}</div>
              <div style={{ fontSize: 12, color: C.muted }}>{c.shortDescription}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Badge color={C.cyan}>{c.category}</Badge>
                <Badge color={DIFF_COLOR[c.difficulty]}>{c.difficulty}</Badge>
                <Badge color={C.text}>{c.points} PTS</Badge>
              </div>
              <div style={{ fontSize: 11, color: C.muted }}>{c.solveCount} solve{c.solveCount !== 1 ? "s" : ""}</div>
              <PrimaryButton onClick={() => goto("detail", c.id)} style={{ marginTop: 4 }}>View Challenge</PrimaryButton>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}

function ChallengeDetailView({ challenge, currentUser, goto, onSubmit }) {
  const [guess, setGuess] = useState("");
  const [revealedHints, setRevealedHints] = useState([]);
  const [busy, setBusy] = useState(false);
  const [liveStatus, setLiveStatus] = useState(null); // null | { takenOver, error? }
  const [liveChecking, setLiveChecking] = useState(false);

  // Generic hook: if this challenge's Instructions contain [[special:<hash>]],
  // look up that plugin's checkStatus() (from specialChallenges.js) and poll
  // it in the background, auto-filling the flag box once it succeeds. This
  // is the only place that needs to exist for ANY future live challenge —
  // adding a new one is just a new file in special-challenges/, nothing here.
  const specialMatch = challenge?.instructions?.match(/\[\[special:([a-z0-9-]+)\]\]/i);
  const special = specialMatch ? getSpecialChallengeByHash(specialMatch[1]) : null;
  const cleanInstructions = challenge?.instructions?.replace(/\[\[special:[a-z0-9-]+\]\]/gi, "").trim();

  useEffect(() => {
    if (!special?.checkStatus || challenge?.solved) return;
    let stopped = false;
    async function poll() {
      setLiveChecking(true);
      try {
        const result = await special.checkStatus();
        if (stopped) return;
        setLiveStatus(result);
        if (result.takenOver && result.flag) setGuess(result.flag);
      } catch (e) {
        if (!stopped) setLiveStatus({ takenOver: false, error: e.message });
      }
      if (!stopped) setLiveChecking(false);
    }
    poll();
    const id = setInterval(poll, 5000);
    return () => { stopped = true; clearInterval(id); };
  }, [special, challenge?.id, challenge?.solved]);

  if (!challenge) return <Panel>Challenge not found. <span onClick={() => goto("challenges")} style={{ color: C.cyan, cursor: "pointer" }}>Back to challenges</span></Panel>;

  const deduction = revealedHints.reduce((sum, i) => sum + (challenge.hints[i]?.deduction || 0), 0);

  async function submit() {
    if (!guess.trim() || busy) return;
    setBusy(true);
    await onSubmit(challenge, guess);
    setBusy(false);
    setGuess("");
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <span onClick={() => goto("challenges")} style={{ color: C.muted, fontSize: 12, cursor: "pointer" }}>&larr; Back to challenges</span>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "10px 0 4px", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>{challenge.title}</h1>
        {challenge.solved && <Badge color={C.green}>Solved</Badge>}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
        <Badge color={C.cyan}>{challenge.category}</Badge>
        <Badge color={DIFF_COLOR[challenge.difficulty]}>{challenge.difficulty}</Badge>
        <Badge color={C.text}>{challenge.points} PTS</Badge>
      </div>
      <Panel style={{ marginBottom: 18 }}>
        <SectionLabel>Description</SectionLabel>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: C.text }}>{challenge.description}</p>
        {challenge.learningObjective && <><SectionLabel>Learning Objective</SectionLabel><p style={{ fontSize: 13, lineHeight: 1.7, color: C.muted }}>{challenge.learningObjective}</p></>}
        {cleanInstructions && <><SectionLabel>Instructions</SectionLabel><p style={{ fontSize: 13, lineHeight: 1.7, color: C.muted }}>{cleanInstructions}</p></>}
      </Panel>
      {special && !challenge.solved && (
        <Panel style={{ marginBottom: 18 }}>
          <SectionLabel>Live Status</SectionLabel>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: liveStatus?.takenOver ? C.green : liveChecking ? C.warning : C.error }} />
            <span style={{ fontSize: 13, color: C.text }}>
              {liveStatus?.takenOver ? "Takeover confirmed — flag filled in below." : liveChecking ? "Checking..." : "Not detected yet. Checking every 5 seconds."}
            </span>
          </div>
          {liveStatus?.error && <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>{liveStatus.error}</div>}
        </Panel>
      )}
      {(challenge.imageUrl || challenge.audioUrl || (challenge.files && challenge.files.length > 0)) && (
        <Panel style={{ marginBottom: 18 }}>
          <SectionLabel>Attachments</SectionLabel>
          {challenge.imageUrl && <img src={challenge.imageUrl} alt="challenge attachment" style={{ maxWidth: "100%", borderRadius: 8, border: `1px solid ${C.cardBorder}`, marginBottom: 14 }} />}
          {challenge.audioUrl && <div style={{ marginBottom: 14 }}><div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 12, color: C.muted }}><Music size={14} /> Audio attachment</div><audio controls src={challenge.audioUrl} style={{ width: "100%" }} /></div>}
          {(challenge.files || []).map((f, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: i === 0 ? "none" : `1px solid ${C.cardBorder}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}><Paperclip size={14} color={C.muted} /> {f.name} <span style={{ color: C.muted, fontSize: 11 }}>{f.type}</span></div>
              <a href={f.url} target="_blank" rel="noreferrer" style={{ color: C.cyan, display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}><Download size={13} /> Download</a>
            </div>
          ))}
        </Panel>
      )}
      {challenge.hints && challenge.hints.length > 0 && (
        <Panel style={{ marginBottom: 18 }}>
          <SectionLabel>Hints</SectionLabel>
          {challenge.hints.map((h, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              {revealedHints.includes(i) ? <div style={{ fontSize: 13, color: C.text, background: C.bg2, padding: 10, borderRadius: 6 }}>{h.text}</div> :
                <div onClick={() => setRevealedHints([...revealedHints, i])} style={{ fontSize: 12, color: C.warning, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                  <Eye size={13} /> Reveal hint {i + 1} {h.deduction ? `(-${h.deduction} pts)` : ""}
                </div>}
            </div>
          ))}
        </Panel>
      )}
      <Panel style={{ marginBottom: 18 }}>
        <SectionLabel>Submit Flag</SectionLabel>
        {challenge.solved ? <div style={{ color: C.green, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle2 size={18} /> Already solved. Points awarded.</div> : (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input value={guess} onChange={(e) => setGuess(e.target.value)} placeholder="FLAG{...}" style={{ flex: "1 1 260px", background: C.bg2, border: `1px solid ${C.cardBorder}`, borderRadius: 8, color: C.green, fontFamily: MONO, fontSize: 14, padding: "10px 12px", outline: "none" }} />
            <PrimaryButton onClick={submit} disabled={busy}>{busy ? "Checking..." : "Submit Flag"}</PrimaryButton>
          </div>
        )}
        {deduction > 0 && !challenge.solved && <div style={{ fontSize: 11, color: C.warning, marginTop: 8 }}>Hint deductions if solved: -{deduction} pts</div>}
      </Panel>
      <Panel>
        <SectionLabel>Challenge Statistics</SectionLabel>
        <div style={{ display: "flex", gap: 24, fontSize: 13, color: C.muted }}>
          <div>Solves: <span style={{ color: C.text }}>{challenge.solveCount}</span></div>
          <div>Points: <span style={{ color: C.text }}>{challenge.points}</span></div>
          <div>Difficulty: <span style={{ color: DIFF_COLOR[challenge.difficulty] }}>{challenge.difficulty}</span></div>
        </div>
      </Panel>
    </div>
  );
}

function LeaderboardView({ leaderboard }) {
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Leaderboard</h1>
      <p style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>All-time rankings across every registered user.</p>
      <Panel style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 100px 100px", padding: "12px 18px", borderBottom: `1px solid ${C.cardBorder}`, fontSize: 11, color: C.muted, textTransform: "uppercase" }}>
          <div>Rank</div><div>User</div><div>Solves</div><div>Points</div>
        </div>
        {leaderboard.length === 0 && <div style={{ padding: 20, color: C.muted, fontSize: 13 }}>No solves yet. Be the first.</div>}
        {leaderboard.map((row, i) => (
          <div key={row.username} style={{ display: "grid", gridTemplateColumns: "60px 1fr 100px 100px", padding: "14px 18px", borderBottom: `1px solid ${C.cardBorder}`, fontSize: 14 }}>
            <div>{i < 3 ? medals[i] : `#${i + 1}`}</div><div style={{ color: C.text }}>{row.username}</div><div style={{ color: C.muted }}>{row.solves}</div><div style={{ color: C.green, fontWeight: 700 }}>{row.points}</div>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function RulesView() {
  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{ fontSize: 24, marginBottom: 18 }}>Rules</h1>
      <Panel>
        <ul style={{ fontSize: 14, lineHeight: 2, color: C.text, paddingLeft: 18 }}>
          <li>One account per participant. Do not share flags with other users.</li>
          <li>Do not attempt to attack the platform itself — only the challenges provided.</li>
          <li>Hints reduce the points awarded for a challenge once you solve it.</li>
          <li>Each challenge can only be solved once per account.</li>
          <li>Be respectful. Report bugs to an administrator rather than exploiting them.</li>
        </ul>
      </Panel>
    </div>
  );
}
function AboutView() {
  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{ fontSize: 24, marginBottom: 18 }}>About CTF Lab</h1>
      <Panel><p style={{ fontSize: 14, lineHeight: 1.8, color: C.text }}>CTF Lab is a training environment for cybersecurity students, ethical hackers, and security professionals. Challenges span web security, networking, cryptography, forensics, reverse engineering, and more — all in a safe, controlled sandbox built for learning by doing.</p></Panel>
    </div>
  );
}

function AuthView({ onLogin, onRegister }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  return (
    <div style={{ maxWidth: 380, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 22 }}>
        <div onClick={() => setMode("login")} style={{ flex: 1, textAlign: "center", padding: 10, cursor: "pointer", borderRadius: 8, background: mode === "login" ? C.card : "transparent", border: `1px solid ${C.cardBorder}`, color: mode === "login" ? C.green : C.muted, fontSize: 13 }}>Login</div>
        <div onClick={() => setMode("register")} style={{ flex: 1, textAlign: "center", padding: 10, cursor: "pointer", borderRadius: 8, background: mode === "register" ? C.card : "transparent", border: `1px solid ${C.cardBorder}`, color: mode === "register" ? C.green : C.muted, fontSize: 13 }}>Register</div>
      </div>
      <Panel>
        <TextField label="Username" value={username} onChange={setUsername} placeholder="cyber_mahen" />
        <div style={{ position: "relative" }}>
          <TextField label="Password" value={password} onChange={setPassword} placeholder="••••••••" type={showPw ? "text" : "password"} />
          <div onClick={() => setShowPw((s) => !s)} style={{ position: "absolute", right: 10, top: 32, cursor: "pointer", color: C.muted }}>{showPw ? <EyeOff size={16} /> : <Eye size={16} />}</div>
        </div>
        <PrimaryButton onClick={() => mode === "login" ? onLogin(username, password) : onRegister(username, password)} style={{ width: "100%", marginTop: 6 }}>{mode === "login" ? "Log In" : "Create Account"}</PrimaryButton>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 14, lineHeight: 1.6 }}>Demo admin account — username <span style={{ color: C.cyan }}>admin</span>, password from the backend's <code>.env</code> (default <span style={{ color: C.cyan }}>admin123</span>).</div>
      </Panel>
    </div>
  );
}

function DashboardView({ user, challenges, goto, leaderboard }) {
  const solved = challenges.filter((c) => c.solved);
  const unsolved = challenges.filter((c) => !c.solved);
  const rank = leaderboard.findIndex((r) => r.username === user.username) + 1;
  const accuracy = challenges.length ? Math.round((solved.length / challenges.length) * 100) : 0;
  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Welcome, {user.username}</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, margin: "20px 0" }}>
        <StatCard label="Total Points" value={user.totalPoints || 0} color={C.green} />
        <StatCard label="Challenges Solved" value={solved.length} color={C.cyan} />
        <StatCard label="Current Rank" value={rank ? `#${rank}` : "—"} color={C.text} />
        <StatCard label="Progress" value={`${accuracy}%`} color={C.warning} />
      </div>
      <Panel style={{ marginBottom: 20 }}>
        <SectionLabel>Progress</SectionLabel>
        <div style={{ background: C.bg2, borderRadius: 8, height: 10, overflow: "hidden" }}><div style={{ width: `${accuracy}%`, height: "100%", background: C.green }} /></div>
      </Panel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Panel>
          <SectionLabel>Solved Challenges ({solved.length})</SectionLabel>
          {solved.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>Nothing solved yet.</div>}
          {solved.map((c) => <div key={c.id} onClick={() => goto("detail", c.id)} style={{ padding: "8px 0", borderBottom: `1px solid ${C.cardBorder}`, cursor: "pointer", fontSize: 13, display: "flex", justifyContent: "space-between" }}><span>{c.title}</span><span style={{ color: C.green }}>+{c.points}</span></div>)}
        </Panel>
        <Panel>
          <SectionLabel>Unsolved Challenges ({unsolved.length})</SectionLabel>
          {unsolved.slice(0, 8).map((c) => <div key={c.id} onClick={() => goto("detail", c.id)} style={{ padding: "8px 0", borderBottom: `1px solid ${C.cardBorder}`, cursor: "pointer", fontSize: 13, display: "flex", justifyContent: "space-between" }}><span>{c.title}</span><span style={{ color: C.muted }}>{c.points} pts</span></div>)}
        </Panel>
      </div>
    </div>
  );
}

function LockedNotice({ goto }) {
  return <Panel style={{ textAlign: "center", padding: 40 }}><Lock size={28} color={C.warning} style={{ marginBottom: 12 }} /><div style={{ fontSize: 14, color: C.text, marginBottom: 16 }}>Log in to view this page.</div><PrimaryButton onClick={() => goto("auth")}>Login / Register</PrimaryButton></Panel>;
}

function AdminHome({ stats, goto }) {
  const items = [{ label: "Add Challenge", icon: Plus, view: "adminAdd" }, { label: "Manage Challenges", icon: LayoutDashboard, view: "adminManage" }, { label: "Leaderboard", icon: Trophy, view: "leaderboard" }];
  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}><Shield size={22} color={C.cyan} /> Admin Dashboard</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, margin: "20px 0 28px" }}>
        <StatCard label="Total Challenges" value={stats?.totalChallenges ?? "—"} color={C.green} />
        <StatCard label="Active Users" value={stats?.activeUsers ?? "—"} color={C.cyan} />
        <StatCard label="Total Solves" value={stats?.totalSolves ?? "—"} color={C.text} />
        <StatCard label="Points Awarded" value={stats?.totalPoints ?? "—"} color={C.warning} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
        {items.map((it) => { const Icon = it.icon; return <Panel key={it.label} style={{ cursor: "pointer", textAlign: "center" }} onClick={() => goto(it.view)}><Icon size={22} color={C.green} style={{ marginBottom: 8 }} /><div style={{ fontSize: 13 }}>{it.label}</div></Panel>; })}
      </div>
    </div>
  );
}

function AdminManage({ challenges, goto, setEditingId, onDelete, onArchive }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h1 style={{ fontSize: 22 }}>Manage Challenges</h1>
        <PrimaryButton onClick={() => goto("adminAdd")}><Plus size={14} style={{ verticalAlign: -2, marginRight: 4 }} /> Add Challenge</PrimaryButton>
      </div>
      <Panel style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 90px 80px 90px 140px", padding: "10px 16px", borderBottom: `1px solid ${C.cardBorder}`, fontSize: 11, color: C.muted, textTransform: "uppercase" }}>
          <div>Title</div><div>Category</div><div>Points</div><div>Solves</div><div>Status</div><div>Actions</div>
        </div>
        {challenges.map((c) => (
          <div key={c.id} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 90px 80px 90px 140px", padding: "12px 16px", borderBottom: `1px solid ${C.cardBorder}`, fontSize: 13, alignItems: "center" }}>
            <div>{c.title}</div><div style={{ color: C.muted }}>{c.category}</div><div>{c.points}</div><div>{c.solveCount}</div>
            <div><Badge color={c.status === "Published" ? C.green : c.status === "Draft" ? C.warning : C.muted}>{c.status}</Badge></div>
            <div style={{ display: "flex", gap: 10 }}>
              <Pencil size={15} color={C.cyan} style={{ cursor: "pointer" }} onClick={() => { setEditingId(c.id); goto("adminEdit"); }} />
              <Archive size={15} color={C.warning} style={{ cursor: "pointer" }} onClick={() => onArchive(c.id)} />
              <Trash2 size={15} color={C.error} style={{ cursor: "pointer" }} onClick={() => { if (confirm(`Delete "${c.title}"?`)) onDelete(c.id); }} />
            </div>
          </div>
        ))}
        {challenges.length === 0 && <div style={{ padding: 20, color: C.muted }}>No challenges yet.</div>}
      </Panel>
    </div>
  );
}

function AdminChallengeForm({ challenge, onCreate, onUpdate, goto }) {
  const blank = { title: "", category: CATEGORIES[0].name, difficulty: "Easy", points: DIFF_DEFAULT_PTS.Easy, author: "admin", status: "Draft", shortDescription: "", description: "", learningObjective: "", instructions: "", flag: "", imageUrl: "", audioUrl: "", files: [], hints: [] };
  const [form, setForm] = useState(challenge ? {
    title: challenge.title, category: challenge.category, difficulty: challenge.difficulty, points: challenge.points, author: challenge.author,
    status: challenge.status, shortDescription: challenge.shortDescription, description: challenge.description, learningObjective: challenge.learningObjective || "",
    instructions: challenge.instructions || "", flag: "", imageUrl: challenge.imageUrl || "", audioUrl: challenge.audioUrl || "",
    files: challenge.files || [], hints: challenge.hints || [],
  } : blank);
  const [fileDraft, setFileDraft] = useState({ name: "", url: "", type: "" });

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  function addHint() { setForm((f) => ({ ...f, hints: [...f.hints, { text: "", deduction: 0 }] })); }
  function updateHint(i, key, val) { setForm((f) => ({ ...f, hints: f.hints.map((h, idx) => idx === i ? { ...h, [key]: val } : h) })); }
  function removeHint(i) { setForm((f) => ({ ...f, hints: f.hints.filter((_, idx) => idx !== i) })); }
  function addFile() { if (!fileDraft.name || !fileDraft.url) return; setForm((f) => ({ ...f, files: [...f.files, fileDraft] })); setFileDraft({ name: "", url: "", type: "" }); }
  function removeFile(i) { setForm((f) => ({ ...f, files: f.files.filter((_, idx) => idx !== i) })); }

  function save(status) {
    if (!form.title.trim()) return alert("Challenge name is required.");
    if (!challenge && !form.flag.trim()) return alert("Flag is required for a new challenge.");
    const payload = { ...form, status, points: Number(form.points) || 0 };
    if (challenge) onUpdate(challenge.id, payload); else onCreate(payload);
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <span onClick={() => goto("adminManage")} style={{ color: C.muted, fontSize: 12, cursor: "pointer" }}>&larr; Back to manage challenges</span>
      <h1 style={{ fontSize: 22, margin: "10px 0 20px" }}>{challenge ? "Edit Challenge" : "Add New CTF Challenge"}</h1>
      <Panel style={{ marginBottom: 16 }}>
        <SectionLabel>Basic Information</SectionLabel>
        <TextField label="Challenge Name" value={form.title} onChange={set("title")} placeholder="SQL Injection Basics" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <SelectField label="Category" value={form.category} onChange={set("category")} options={CATEGORIES.map((c) => c.name)} />
          <SelectField label="Difficulty" value={form.difficulty} onChange={(v) => setForm((f) => ({ ...f, difficulty: v, points: DIFF_DEFAULT_PTS[v] }))} options={DIFFICULTIES} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <TextField label="Points" value={form.points} onChange={set("points")} type="number" />
          <TextField label="Author" value={form.author} onChange={set("author")} />
        </div>
      </Panel>
      <Panel style={{ marginBottom: 16 }}>
        <SectionLabel>Challenge Content</SectionLabel>
        <TextField label="Short Description" value={form.shortDescription} onChange={set("shortDescription")} placeholder="One line shown on the challenge card" />
        <TextField label="Full Description" value={form.description} onChange={set("description")} textarea />
        <TextField label="Learning Objective" value={form.learningObjective} onChange={set("learningObjective")} textarea />
        <TextField label="Instructions" value={form.instructions} onChange={set("instructions")} textarea />
      </Panel>
      <Panel style={{ marginBottom: 16 }}>
        <SectionLabel>Flag</SectionLabel>
        <TextField label={challenge ? "Correct Flag (leave blank to keep current)" : "Correct Flag"} value={form.flag} onChange={set("flag")} placeholder="FLAG{example_flag}" />
        <div style={{ fontSize: 11, color: C.muted }}>The backend stores only a bcrypt hash of this flag. It never travels back to the browser again.</div>
      </Panel>
      <Panel style={{ marginBottom: 16 }}>
        <SectionLabel>Hints</SectionLabel>
        {form.hints.map((h, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
            <input value={h.text} onChange={(e) => updateHint(i, "text", e.target.value)} placeholder={`Hint ${i + 1}`} style={{ flex: 1, background: C.bg2, border: `1px solid ${C.cardBorder}`, borderRadius: 8, color: C.text, fontFamily: MONO, fontSize: 13, padding: "9px 10px" }} />
            <input value={h.deduction} onChange={(e) => updateHint(i, "deduction", Number(e.target.value) || 0)} type="number" placeholder="-pts" style={{ width: 80, background: C.bg2, border: `1px solid ${C.cardBorder}`, borderRadius: 8, color: C.warning, fontFamily: MONO, fontSize: 13, padding: "9px 10px" }} />
            <Trash2 size={15} color={C.error} style={{ cursor: "pointer" }} onClick={() => removeHint(i)} />
          </div>
        ))}
        <PrimaryButton type="ghost" onClick={addHint} style={{ fontSize: 11 }}>+ Add Hint</PrimaryButton>
      </Panel>
      <Panel style={{ marginBottom: 16 }}>
        <SectionLabel>Media</SectionLabel>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>Paste a hosted URL for each attachment.</div>
        <TextField label="Challenge Image URL" value={form.imageUrl} onChange={set("imageUrl")} placeholder="https://..." />
        <TextField label="Challenge Audio URL" value={form.audioUrl} onChange={set("audioUrl")} placeholder="https://..." />
        <div style={{ fontFamily: MONO, fontSize: 11, color: C.muted, marginBottom: 6, textTransform: "uppercase" }}>Challenge Files</div>
        {form.files.map((f, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.cardBorder}`, fontSize: 12 }}>
            <span>{f.name} <span style={{ color: C.muted }}>({f.type})</span></span>
            <Trash2 size={14} color={C.error} style={{ cursor: "pointer" }} onClick={() => removeFile(i)} />
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <input value={fileDraft.name} onChange={(e) => setFileDraft({ ...fileDraft, name: e.target.value })} placeholder="filename.zip" style={{ flex: "1 1 120px", background: C.bg2, border: `1px solid ${C.cardBorder}`, borderRadius: 8, color: C.text, fontFamily: MONO, fontSize: 12, padding: "8px 10px" }} />
          <input value={fileDraft.url} onChange={(e) => setFileDraft({ ...fileDraft, url: e.target.value })} placeholder="https://..." style={{ flex: "1 1 160px", background: C.bg2, border: `1px solid ${C.cardBorder}`, borderRadius: 8, color: C.text, fontFamily: MONO, fontSize: 12, padding: "8px 10px" }} />
          <input value={fileDraft.type} onChange={(e) => setFileDraft({ ...fileDraft, type: e.target.value })} placeholder="ZIP" style={{ width: 80, background: C.bg2, border: `1px solid ${C.cardBorder}`, borderRadius: 8, color: C.text, fontFamily: MONO, fontSize: 12, padding: "8px 10px" }} />
          <PrimaryButton type="ghost" onClick={addFile} style={{ fontSize: 11 }}>Add File</PrimaryButton>
        </div>
      </Panel>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <PrimaryButton type="ghost" onClick={() => goto("adminManage")}>Cancel</PrimaryButton>
        <PrimaryButton type="ghost" onClick={() => save("Draft")}>Save Draft</PrimaryButton>
        <PrimaryButton onClick={() => save("Published")}>Publish Challenge</PrimaryButton>
      </div>
    </div>
  );
}

function Footer() {
  return <div style={{ borderTop: `1px solid ${C.cardBorder}`, padding: "24px 20px", textAlign: "center", color: C.muted, fontSize: 12 }}>CTF LAB — a controlled environment for practicing cybersecurity skills.</div>;
}
