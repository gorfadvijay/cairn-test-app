import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

// ─── API helper ──────────────────────────────────────────

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json", ...opts?.headers },
    ...opts,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// ─── Types ───────────────────────────────────────────────

interface User {
  id: string;
  email: string;
  name: string;
}

interface Project {
  id: string;
  name: string;
  target: string;
  state: { target?: string; resources?: Record<string, any> };
  created_at: string;
  updated_at: string;
}

interface Deployment {
  id: string;
  status: string;
  target: string;
  triggered_by: string;
  created_at: string;
}

// ─── Router ──────────────────────────────────────────────

function useRoute() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = (to: string) => {
    window.history.pushState({}, "", to);
    setPath(to);
  };

  return { path, navigate };
}

// ─── Auth Pages ──────────────────────────────────────────

function LoginPage({ onAuth, navigate }: { onAuth: (u: User) => void; navigate: (p: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      onAuth(data.user);
      navigate("/projects");
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <h1>Sign in to Cairn</h1>
        <p>Manage your infrastructure from one dashboard</p>
        <div className="form-group">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary" type="submit">Sign In</button>
        <div className="auth-link">
          No account? <a href="#" onClick={() => navigate("/signup")}>Sign up</a>
        </div>
      </form>
    </div>
  );
}

function SignupPage({ onAuth, navigate }: { onAuth: (u: User) => void; navigate: (p: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = await api("/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email, password, name }),
      });
      onAuth(data.user);
      navigate("/projects");
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <h1>Create account</h1>
        <p>Get started with Cairn Console</p>
        <div className="form-group">
          <label>Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary" type="submit">Create Account</button>
        <div className="auth-link">
          Have an account? <a href="#" onClick={() => navigate("/login")}>Sign in</a>
        </div>
      </form>
    </div>
  );
}

// ─── Dashboard Layout ────────────────────────────────────

function Layout({
  user,
  navigate,
  children,
}: {
  user: User;
  navigate: (p: string) => void;
  children: React.ReactNode;
}) {
  const logout = async () => {
    await api("/auth/logout", { method: "POST" });
    navigate("/login");
    window.location.reload();
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">&#9968; Cairn</div>
        <nav className="sidebar-nav">
          <a className="sidebar-link" onClick={() => navigate("/projects")}>Projects</a>
        </nav>
        <div className="sidebar-user">
          <div>{user.name}</div>
          <div style={{ fontSize: 12, marginTop: 2 }}>{user.email}</div>
          <a className="sidebar-link" style={{ marginTop: 8, display: "block" }} onClick={logout}>
            Sign out
          </a>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

// ─── Project List ────────────────────────────────────────

function ProjectList({ navigate }: { navigate: (p: string) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTarget, setNewTarget] = useState("cloudflare");

  useEffect(() => {
    api("/projects").then((d) => setProjects(d.projects));
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = await api("/projects", {
      method: "POST",
      body: JSON.stringify({ name: newName, target: newTarget }),
    });
    setProjects([data.project, ...projects]);
    setShowCreate(false);
    setNewName("");
  };

  return (
    <>
      <div className="page-header">
        <h1>Projects</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>
          + New Project
        </button>
      </div>

      {showCreate && (
        <form className="card" onSubmit={create}>
          <div style={{ display: "flex", gap: 12 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Project Name</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="my-app" required />
            </div>
            <div className="form-group" style={{ width: 180 }}>
              <label>Target</label>
              <select value={newTarget} onChange={(e) => setNewTarget(e.target.value)}>
                <option value="cloudflare">Cloudflare</option>
                <option value="railway">Railway</option>
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 16 }}>
              <button className="btn btn-primary" type="submit">Create</button>
            </div>
          </div>
        </form>
      )}

      {projects.length === 0 ? (
        <div className="empty-state">
          <h3>No projects yet</h3>
          <p>Create a project or sync one from the CLI</p>
        </div>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Target</th>
                <th>Resources</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/projects/${p.id}`)}>
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td><span className="badge badge-muted">{p.target}</span></td>
                  <td>{Object.keys(p.state?.resources || {}).length}</td>
                  <td style={{ color: "var(--text-muted)" }}>
                    {new Date(p.updated_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ─── Project Detail ──────────────────────────────────────

function ProjectDetail({ projectId, navigate }: { projectId: string; navigate: (p: string) => void }) {
  const [project, setProject] = useState<Project | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [secrets, setSecrets] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [tab, setTab] = useState<"resources" | "deployments" | "secrets" | "branches" | "logs">("resources");
  const [deploying, setDeploying] = useState(false);

  const load = () => {
    api(`/projects/${projectId}`).then((d) => {
      setProject(d.project);
      setDeployments(d.deployments || []);
    });
    api(`/projects/${projectId}/resources`).then((d) => setResources(d.resources || []));
    api(`/projects/${projectId}/secrets`).then((d) => setSecrets(d.secrets || []));
    api(`/projects/${projectId}/branches`).then((d) => setBranches(d.branches || [])).catch(() => {});
  };

  useEffect(load, [projectId]);

  const triggerDeploy = async () => {
    setDeploying(true);
    try {
      await api(`/projects/${projectId}/deploy`, { method: "POST" });
      load();
    } finally {
      setDeploying(false);
    }
  };

  const deleteProject = async () => {
    if (!confirm("Delete this project?")) return;
    await api(`/projects/${projectId}`, { method: "DELETE" });
    navigate("/projects");
  };

  if (!project) return <div>Loading...</div>;

  return (
    <>
      <div className="page-header">
        <div>
          <a style={{ color: "var(--text-muted)", cursor: "pointer", fontSize: 13 }} onClick={() => navigate("/projects")}>
            &larr; Projects
          </a>
          <h1 style={{ marginTop: 4 }}>{project.name}</h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" onClick={triggerDeploy} disabled={deploying}>
            {deploying ? "Deploying..." : "Deploy"}
          </button>
          <button className="btn btn-danger btn-sm" onClick={deleteProject}>Delete</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {(["resources", "deployments", "secrets", "branches", "logs"] as const).map((t) => (
          <button
            key={t}
            className={`btn btn-sm ${tab === t ? "btn-primary" : ""}`}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        <span className="badge badge-muted" style={{ marginLeft: "auto" }}>
          {project.target}
        </span>
      </div>

      {tab === "resources" && <ResourcesTab resources={resources} />}
      {tab === "deployments" && <DeploymentsTab deployments={deployments} />}
      {tab === "secrets" && <SecretsTab projectId={projectId} secrets={secrets} onUpdate={load} />}
      {tab === "branches" && <BranchesTab projectId={projectId} branches={branches} onUpdate={load} />}
      {tab === "logs" && <LogsTab />}
    </>
  );
}

function ResourcesTab({ resources }: { resources: any[] }) {
  if (!resources.length) {
    return <div className="empty-state"><h3>No resources</h3><p>Deploy your project to provision resources</p></div>;
  }

  return (
    <div className="resource-grid">
      {resources.map((r) => (
        <div className="resource-card" key={r.key}>
          <div className="resource-type">{r.type}</div>
          <div className="resource-name">{r.name}</div>
          {r.url && <div className="resource-detail">{r.url}</div>}
          {r.serviceId && <div className="resource-detail">ID: {r.serviceId}</div>}
        </div>
      ))}
    </div>
  );
}

function DeploymentsTab({ deployments }: { deployments: Deployment[] }) {
  if (!deployments.length) {
    return <div className="empty-state"><h3>No deployments</h3></div>;
  }

  const statusBadge = (s: string) => {
    const map: Record<string, string> = { success: "badge-success", failed: "badge-danger", pending: "badge-warning", queued: "badge-warning" };
    return map[s] || "badge-muted";
  };

  return (
    <div className="card">
      <table className="table">
        <thead>
          <tr><th>Status</th><th>Target</th><th>Triggered By</th><th>Date</th></tr>
        </thead>
        <tbody>
          {deployments.map((d) => (
            <tr key={d.id}>
              <td><span className={`badge ${statusBadge(d.status)}`}>{d.status}</span></td>
              <td>{d.target}</td>
              <td>{d.triggered_by}</td>
              <td style={{ color: "var(--text-muted)" }}>{new Date(d.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SecretsTab({ projectId, secrets, onUpdate }: { projectId: string; secrets: any[]; onUpdate: () => void }) {
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const addSecret = async (e: React.FormEvent) => {
    e.preventDefault();
    await api(`/projects/${projectId}/secrets`, {
      method: "POST",
      body: JSON.stringify({ key: newKey, value: newValue }),
    });
    setNewKey("");
    setNewValue("");
    onUpdate();
  };

  const remove = async (key: string) => {
    await api(`/projects/${projectId}/secrets/${key}`, { method: "DELETE" });
    onUpdate();
  };

  return (
    <>
      <form className="card" onSubmit={addSecret}>
        <div style={{ display: "flex", gap: 12 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Key</label>
            <input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="API_KEY" required />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Value</label>
            <input type="password" value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="secret" required />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 16 }}>
            <button className="btn btn-primary" type="submit">Add</button>
          </div>
        </div>
      </form>

      {secrets.length > 0 && (
        <div className="card">
          <table className="table">
            <thead><tr><th>Key</th><th>Added</th><th></th></tr></thead>
            <tbody>
              {secrets.map((s: any) => (
                <tr key={s.id}>
                  <td style={{ fontFamily: "monospace" }}>{s.key}</td>
                  <td style={{ color: "var(--text-muted)" }}>{new Date(s.created_at).toLocaleDateString()}</td>
                  <td><button className="btn btn-danger btn-sm" onClick={() => remove(s.key)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function BranchesTab({ projectId, branches, onUpdate }: { projectId: string; branches: any[]; onUpdate: () => void }) {
  const [newBranch, setNewBranch] = useState("");
  const [creating, setCreating] = useState(false);

  const createBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await api(`/projects/${projectId}/branches`, {
        method: "POST",
        body: JSON.stringify({ name: newBranch }),
      });
      setNewBranch("");
      onUpdate();
    } finally {
      setCreating(false);
    }
  };

  const destroyBranch = async (name: string) => {
    if (!confirm(`Destroy branch "${name}"? This will delete all branch resources.`)) return;
    await api(`/projects/${projectId}/branches/${name}`, { method: "DELETE" });
    onUpdate();
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      active: "badge-success", deploying: "badge-warning", failed: "badge-danger", destroyed: "badge-muted",
    };
    return map[s] || "badge-muted";
  };

  return (
    <>
      <form className="card" onSubmit={createBranch}>
        <div style={{ display: "flex", gap: 12 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Branch Name</label>
            <input
              value={newBranch}
              onChange={(e) => setNewBranch(e.target.value)}
              placeholder="feature-auth"
              pattern="[a-zA-Z0-9._-]+"
              required
            />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 16 }}>
            <button className="btn btn-primary" type="submit" disabled={creating}>
              {creating ? "Creating..." : "Create Branch"}
            </button>
          </div>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: -8 }}>
          Creates an isolated environment with its own database, cache, and compute
        </div>
      </form>

      {branches.length === 0 ? (
        <div className="empty-state">
          <h3>No branch environments</h3>
          <p>Create a branch or connect GitHub to auto-create on PR</p>
          <div style={{ marginTop: 12, fontSize: 13, color: "var(--text-muted)" }}>
            $ cairn branch create feature-auth
          </div>
        </div>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr><th>Branch</th><th>Status</th><th>PR</th><th>URLs</th><th>Created</th><th></th></tr>
            </thead>
            <tbody>
              {branches.map((b: any) => {
                const urls = typeof b.urls === "object" ? b.urls : {};
                return (
                  <tr key={b.id}>
                    <td style={{ fontFamily: "monospace", fontWeight: 600 }}>{b.name}</td>
                    <td><span className={`badge ${statusBadge(b.status)}`}>{b.status}</span></td>
                    <td>{b.pr_number ? `#${b.pr_number}` : "-"}</td>
                    <td>
                      {Object.entries(urls).map(([name, url]) => (
                        <div key={name} style={{ fontSize: 12 }}>
                          <a href={url as string} target="_blank" rel="noopener" style={{ color: "var(--accent)" }}>
                            {name}
                          </a>
                        </div>
                      ))}
                    </td>
                    <td style={{ color: "var(--text-muted)" }}>
                      {new Date(b.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => destroyBranch(b.name)}>
                        Destroy
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function LogsTab() {
  return (
    <div className="log-viewer">
      <div style={{ color: "var(--text-muted)" }}>Connect a deployed service to view live logs.</div>
      <div style={{ marginTop: 8 }}>$ cairn logs api</div>
    </div>
  );
}

// ─── App Root ────────────────────────────────────────────

function App() {
  const { path, navigate } = useRoute();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/auth/me")
      .then((d) => setUser(d.user))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  // Auth pages
  if (!user || path === "/login") {
    if (path === "/signup") return <SignupPage onAuth={setUser} navigate={navigate} />;
    return <LoginPage onAuth={setUser} navigate={navigate} />;
  }

  // Extract project ID from path
  const projectMatch = path.match(/^\/projects\/([a-f0-9-]+)/);

  return (
    <Layout user={user} navigate={navigate}>
      {projectMatch ? (
        <ProjectDetail projectId={projectMatch[1]!} navigate={navigate} />
      ) : (
        <ProjectList navigate={navigate} />
      )}
    </Layout>
  );
}

// Mount
createRoot(document.getElementById("root")!).render(<App />);
