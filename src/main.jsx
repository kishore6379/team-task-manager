import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const initialUser = JSON.parse(localStorage.getItem("user") || "null");
const initialToken = localStorage.getItem("token");

function statusText(status) {
  return {
    TODO: "To do",
    IN_PROGRESS: "In progress",
    DONE: "Done"
  }[status] || status;
}

function formatDate(date) {
  if (!date) return "-";
  return new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function isOverdue(task) {
  return task.dueDate && task.status !== "DONE" && new Date(task.dueDate) < new Date();
}

function Badge({ children, tone = "" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function App() {
  const [token, setToken] = useState(initialToken);
  const [user, setUser] = useState(initialUser);
  const [authMode, setAuthMode] = useState("login");
  const [activeView, setActiveView] = useState("dashboard");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState({ projects: 0, total: 0, todo: 0, inProgress: 0, done: 0, overdue: 0 });

  const isAdmin = user?.role === "ADMIN";

  const headers = useMemo(() => ({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }), [token]);

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: { ...headers, ...(options.headers || {}) }
    });
    if (response.status === 204) return null;
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || "Request failed");
    return payload;
  }

  function flash(text) {
    setMessage(text);
    window.clearTimeout(flash.timer);
    flash.timer = window.setTimeout(() => setMessage(""), 3500);
  }

  async function loadData() {
    if (!token) return;
    setLoading(true);
    try {
      const [usersData, projectsData, tasksData, dashboardData] = await Promise.all([
        api("/api/users"),
        api("/api/projects"),
        api("/api/tasks"),
        api("/api/dashboard")
      ]);
      setUsers(usersData.users);
      setProjects(projectsData.projects);
      setTasks(tasksData.tasks);
      setStats(dashboardData.stats);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) {
      loadData().catch((error) => {
        logout();
        flash(error.message);
      });
    }
  }, [token]);

  function loginSession(payload) {
    setToken(payload.token);
    setUser(payload.user);
    localStorage.setItem("token", payload.token);
    localStorage.setItem("user", JSON.stringify(payload.user));
  }

  function logout() {
    setToken(null);
    setUser(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  }

  async function submitAuth(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      email: form.get("email"),
      password: form.get("password")
    };
    if (authMode === "signup") payload.name = form.get("name");

    try {
      const data = await fetch(`/api/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || "Authentication failed");
        return body;
      });
      loginSession(data);
    } catch (error) {
      flash(error.message);
    }
  }

  async function createProject(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api("/api/projects", {
      method: "POST",
      body: JSON.stringify({
        name: form.get("name"),
        description: form.get("description"),
        memberIds: form.getAll("memberIds")
      })
    });
    event.currentTarget.reset();
    await loadData();
    flash("Project created.");
  }

  async function createTask(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api("/api/tasks", {
      method: "POST",
      body: JSON.stringify({
        title: form.get("title"),
        description: form.get("description"),
        projectId: form.get("projectId"),
        assigneeId: form.get("assigneeId"),
        dueDate: form.get("dueDate")
      })
    });
    event.currentTarget.reset();
    await loadData();
    flash("Task created.");
  }

  async function updateTaskStatus(taskId, status) {
    await api(`/api/tasks/${taskId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
    await loadData();
    flash("Task status updated.");
  }

  async function updateRole(userId, role) {
    await api(`/api/users/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role })
    });
    await loadData();
    flash("Role updated.");
  }

  async function deleteProject(projectId) {
    if (!window.confirm("Delete this project and its tasks?")) return;
    await api(`/api/projects/${projectId}`, { method: "DELETE" });
    await loadData();
    flash("Project deleted.");
  }

  async function deleteTask(taskId) {
    if (!window.confirm("Delete this task?")) return;
    await api(`/api/tasks/${taskId}`, { method: "DELETE" });
    await loadData();
    flash("Task deleted.");
  }

  if (!token || !user) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <div>
            <p className="eyebrow">Placement Sprint</p>
            <h1>Team Task Manager</h1>
            <p className="muted">Projects, assignments, progress tracking, and role-based access in one focused workspace.</p>
          </div>
          <form className="form-stack" onSubmit={submitAuth}>
            <div className="tabs">
              <button type="button" className={`tab ${authMode === "login" ? "active" : ""}`} onClick={() => setAuthMode("login")}>Login</button>
              <button type="button" className={`tab ${authMode === "signup" ? "active" : ""}`} onClick={() => setAuthMode("signup")}>Signup</button>
            </div>
            {authMode === "signup" && (
              <label>Name<input name="name" type="text" placeholder="Your name" required /></label>
            )}
            <label>Email<input name="email" type="email" placeholder="admin@example.com" required /></label>
            <label>Password<input name="password" type="password" placeholder="Admin@123" required /></label>
            <button className="primary">Continue</button>
            <p className="hint">Demo: admin@example.com / Admin@123, member@example.com / Member@123</p>
            {message && <p className="message">{message}</p>}
          </form>
        </section>
      </main>
    );
  }

  const viewTitles = {
    dashboard: ["Overview", "Dashboard"],
    projects: ["Management", "Projects"],
    tasks: ["Tracking", "Tasks"],
    team: ["Access", "Team"]
  };
  const [kicker, title] = viewTitles[activeView];

  return (
    <main className="app">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Workspace</p>
          <h2>Task Manager</h2>
        </div>
        <nav>
          {Object.keys(viewTitles).map((view) => (
            <button key={view} className={`nav ${activeView === view ? "active" : ""}`} onClick={() => setActiveView(view)}>
              {viewTitles[view][1]}
            </button>
          ))}
        </nav>
        <div className="profile">
          <strong>{user.name}</strong>
          <span>{user.role}</span>
          <button className="secondary" onClick={logout}>Logout</button>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">{kicker}</p>
            <h1>{title}</h1>
          </div>
          <button className="secondary" onClick={() => loadData().then(() => flash("Workspace refreshed."))}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </header>
        {message && <div className="message">{message}</div>}

        {activeView === "dashboard" && <Dashboard stats={stats} tasks={tasks} />}
        {activeView === "projects" && (
          <Projects
            isAdmin={isAdmin}
            users={users}
            projects={projects}
            onCreate={createProject}
            onDelete={deleteProject}
          />
        )}
        {activeView === "tasks" && (
          <Tasks
            isAdmin={isAdmin}
            users={users}
            projects={projects}
            tasks={tasks}
            onCreate={createTask}
            onDelete={deleteTask}
            onStatus={updateTaskStatus}
          />
        )}
        {activeView === "team" && (
          <Team isAdmin={isAdmin} currentUser={user} users={users} onRole={updateRole} />
        )}
      </section>
    </main>
  );
}

function Dashboard({ stats, tasks }) {
  return (
    <>
      <div className="grid stats">
        <Stat label="Projects" value={stats.projects} />
        <Stat label="Total Tasks" value={stats.total} />
        <Stat label="To Do" value={stats.todo} />
        <Stat label="In Progress" value={stats.inProgress} />
        <Stat label="Overdue" value={stats.overdue} />
      </div>
      <div className="table-wrap top-space">
        <TaskTable tasks={tasks.slice(0, 8)} compact />
      </div>
    </>
  );
}

function Stat({ label, value }) {
  return <div className="stat"><span>{label}</span><strong>{value}</strong></div>;
}

function Projects({ isAdmin, users, projects, onCreate, onDelete }) {
  return (
    <div className="layout">
      {isAdmin ? (
        <form className="card admin-form" onSubmit={onCreate}>
          <h3>Create project</h3>
          <input name="name" placeholder="Project name" required />
          <textarea name="description" placeholder="Short description" />
          <label>
            Team members
            <div className="checkbox-list">
              {users.map((person) => (
                <label key={person.id}>
                  <input type="checkbox" name="memberIds" value={person.id} />
                  {person.name} ({person.role})
                </label>
              ))}
            </div>
          </label>
          <button className="primary">Create Project</button>
        </form>
      ) : (
        <div className="card"><h3>Your access</h3><p className="muted">Members can view assigned projects and update their own task status.</p></div>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Project</th><th>Team</th><th>Tasks</th><th>Updated</th><th></th></tr></thead>
          <tbody>
            {projects.length === 0 && <tr><td colSpan="5">No projects yet.</td></tr>}
            {projects.map((project) => (
              <tr key={project.id}>
                <td><strong>{project.name}</strong><br /><span className="muted">{project.description}</span></td>
                <td>{project.members.map((member) => member.user.name).join(", ")}</td>
                <td>{project.tasks.length}</td>
                <td>{formatDate(project.updatedAt)}</td>
                <td>{isAdmin && <button className="danger" onClick={() => onDelete(project.id)}>Delete</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Tasks({ isAdmin, users, projects, tasks, onCreate, onDelete, onStatus }) {
  return (
    <div className="layout">
      {isAdmin ? (
        <form className="card admin-form" onSubmit={onCreate}>
          <h3>Create task</h3>
          <input name="title" placeholder="Task title" required />
          <textarea name="description" placeholder="Details" />
          <select name="projectId" required>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <select name="assigneeId">
            <option value="">Unassigned</option>
            {users.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
          <input name="dueDate" type="date" />
          <button className="primary">Create Task</button>
        </form>
      ) : (
        <div className="card"><h3>Status updates</h3><p className="muted">Use the dropdown beside your assigned task to move it from to do to done.</p></div>
      )}
      <div className="table-wrap">
        <TaskTable tasks={tasks} isAdmin={isAdmin} onDelete={onDelete} onStatus={onStatus} />
      </div>
    </div>
  );
}

function TaskTable({ tasks, compact = false, isAdmin = false, onDelete, onStatus }) {
  return (
    <table>
      <thead>
        <tr><th>Task</th><th>Project</th><th>Assignee</th><th>Status</th><th>Due</th>{!compact && <th></th>}</tr>
      </thead>
      <tbody>
        {tasks.length === 0 && <tr><td colSpan={compact ? 5 : 6}>No tasks yet.</td></tr>}
        {tasks.map((task) => (
          <tr key={task.id}>
            <td><strong>{task.title}</strong><br /><span className="muted">{task.description}</span></td>
            <td>{task.project?.name || "-"}</td>
            <td>{task.assignee?.name || "Unassigned"}</td>
            <td>
              {compact ? (
                <>
                  <Badge tone={task.status === "DONE" ? "done" : task.status === "IN_PROGRESS" ? "progress" : ""}>{statusText(task.status)}</Badge>
                  {isOverdue(task) && <Badge tone="overdue">Overdue</Badge>}
                </>
              ) : (
                <select value={task.status} onChange={(event) => onStatus(task.id, event.target.value)}>
                  <option value="TODO">To do</option>
                  <option value="IN_PROGRESS">In progress</option>
                  <option value="DONE">Done</option>
                </select>
              )}
            </td>
            <td>{formatDate(task.dueDate)} {isOverdue(task) && !compact && <Badge tone="overdue">Overdue</Badge>}</td>
            {!compact && <td>{isAdmin && <button className="danger" onClick={() => onDelete(task.id)}>Delete</button>}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Team({ isAdmin, currentUser, users, onRole }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th></tr></thead>
        <tbody>
          {users.map((person) => (
            <tr key={person.id}>
              <td><strong>{person.name}</strong></td>
              <td>{person.email}</td>
              <td>
                {isAdmin && person.id !== currentUser.id ? (
                  <select value={person.role} onChange={(event) => onRole(person.id, event.target.value)}>
                    <option value="ADMIN">Admin</option>
                    <option value="MEMBER">Member</option>
                  </select>
                ) : (
                  <Badge>{person.role}</Badge>
                )}
              </td>
              <td>{formatDate(person.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
