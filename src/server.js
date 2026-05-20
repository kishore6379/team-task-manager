require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const { PrismaClient } = require("@prisma/client");

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-before-deploy";

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));
app.use(express.static(path.join(__dirname, "..", "dist")));

const signupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(6).max(100)
});

const loginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1)
});

const projectSchema = z.object({
  name: z.string().trim().min(2).max(90),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  memberIds: z.array(z.string()).default([])
});

const taskSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(800).optional().or(z.literal("")),
  projectId: z.string().min(1),
  assigneeId: z.string().optional().nullable().or(z.literal("")),
  dueDate: z.string().optional().nullable().or(z.literal(""))
});

const statusSchema = z.object({
  status: z.enum(["TODO", "IN_PROGRESS", "DONE"])
});

const roleSchema = z.object({
  role: z.enum(["ADMIN", "MEMBER"])
});

function signUser(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt
  };
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Login required." });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Session expired. Please login again." });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ message: "Admin access required." });
  }
  next();
}

async function canAccessProject(user, projectId) {
  if (user.role === "ADMIN") return true;
  const membership = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId: user.id, projectId } }
  });
  return Boolean(membership);
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "team-task-manager" });
});

app.post("/api/auth/signup", asyncRoute(async (req, res) => {
  const data = signupSchema.parse(req.body);
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) return res.status(409).json({ message: "Email is already registered." });

  const userCount = await prisma.user.count();
  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash: await bcrypt.hash(data.password, 10),
      role: userCount === 0 ? "ADMIN" : "MEMBER"
    }
  });

  res.status(201).json({ user: publicUser(user), token: signUser(user) });
}));

app.post("/api/auth/login", asyncRoute(async (req, res) => {
  const data = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: data.email } });
  if (!user) return res.status(401).json({ message: "Invalid email or password." });

  const valid = await bcrypt.compare(data.password, user.passwordHash);
  if (!valid) return res.status(401).json({ message: "Invalid email or password." });

  res.json({ user: publicUser(user), token: signUser(user) });
}));

app.get("/api/me", requireAuth, asyncRoute(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  res.json({ user: publicUser(user) });
}));

app.get("/api/users", requireAuth, asyncRoute(async (req, res) => {
  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, role: true, createdAt: true }
  });
  res.json({ users });
}));

app.patch("/api/users/:id/role", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const data = roleSchema.parse(req.body);
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { role: data.role }
  });
  res.json({ user: publicUser(user) });
}));

app.get("/api/projects", requireAuth, asyncRoute(async (req, res) => {
  const where = req.user.role === "ADMIN"
    ? {}
    : { members: { some: { userId: req.user.id } } };

  const projects = await prisma.project.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true, role: true } } } },
      tasks: true
    }
  });

  res.json({ projects });
}));

app.post("/api/projects", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const data = projectSchema.parse(req.body);
  const uniqueMembers = [...new Set([...data.memberIds, req.user.id])];

  const project = await prisma.project.create({
    data: {
      name: data.name,
      description: data.description || null,
      members: { create: uniqueMembers.map((userId) => ({ userId })) }
    },
    include: { members: { include: { user: true } }, tasks: true }
  });

  res.status(201).json({ project });
}));

app.patch("/api/projects/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const data = projectSchema.parse(req.body);
  const uniqueMembers = [...new Set([...data.memberIds, req.user.id])];

  const project = await prisma.$transaction(async (tx) => {
    await tx.projectMember.deleteMany({ where: { projectId: req.params.id } });
    return tx.project.update({
      where: { id: req.params.id },
      data: {
        name: data.name,
        description: data.description || null,
        members: { create: uniqueMembers.map((userId) => ({ userId })) }
      },
      include: { members: { include: { user: true } }, tasks: true }
    });
  });

  res.json({ project });
}));

app.delete("/api/projects/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  await prisma.project.delete({ where: { id: req.params.id } });
  res.status(204).end();
}));

app.get("/api/tasks", requireAuth, asyncRoute(async (req, res) => {
  const where = req.user.role === "ADMIN"
    ? {}
    : {
        OR: [
          { assigneeId: req.user.id },
          { project: { members: { some: { userId: req.user.id } } } }
        ]
      };

  const tasks = await prisma.task.findMany({
    where,
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    include: {
      project: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } }
    }
  });

  res.json({ tasks });
}));

app.post("/api/tasks", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const data = taskSchema.parse(req.body);
  const allowed = await canAccessProject(req.user, data.projectId);
  if (!allowed) return res.status(403).json({ message: "You cannot access this project." });

  const task = await prisma.task.create({
    data: {
      title: data.title,
      description: data.description || null,
      projectId: data.projectId,
      assigneeId: data.assigneeId || null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      createdById: req.user.id
    }
  });
  res.status(201).json({ task });
}));

app.patch("/api/tasks/:id/status", requireAuth, asyncRoute(async (req, res) => {
  const data = statusSchema.parse(req.body);
  const task = await prisma.task.findUnique({ where: { id: req.params.id } });
  if (!task) return res.status(404).json({ message: "Task not found." });

  const isAssignee = task.assigneeId === req.user.id;
  if (req.user.role !== "ADMIN" && !isAssignee) {
    return res.status(403).json({ message: "Only admins or the assignee can update status." });
  }

  const updated = await prisma.task.update({
    where: { id: req.params.id },
    data: { status: data.status }
  });
  res.json({ task: updated });
}));

app.delete("/api/tasks/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  await prisma.task.delete({ where: { id: req.params.id } });
  res.status(204).end();
}));

app.get("/api/dashboard", requireAuth, asyncRoute(async (req, res) => {
  const taskWhere = req.user.role === "ADMIN"
    ? {}
    : {
        OR: [
          { assigneeId: req.user.id },
          { project: { members: { some: { userId: req.user.id } } } }
        ]
      };

  const [total, todo, inProgress, done, overdue, projects] = await Promise.all([
    prisma.task.count({ where: taskWhere }),
    prisma.task.count({ where: { ...taskWhere, status: "TODO" } }),
    prisma.task.count({ where: { ...taskWhere, status: "IN_PROGRESS" } }),
    prisma.task.count({ where: { ...taskWhere, status: "DONE" } }),
    prisma.task.count({
      where: {
        ...taskWhere,
        status: { not: "DONE" },
        dueDate: { lt: new Date() }
      }
    }),
    prisma.project.count({
      where: req.user.role === "ADMIN" ? {} : { members: { some: { userId: req.user.id } } }
    })
  ]);

  res.json({ stats: { projects, total, todo, inProgress, done, overdue } });
}));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "dist", "index.html"));
});

app.use((error, req, res, next) => {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ message: error.errors[0]?.message || "Invalid input." });
  }
  if (error.code === "P2025") {
    return res.status(404).json({ message: "Record not found." });
  }
  console.error(error);
  res.status(500).json({ message: "Something went wrong." });
});

async function ensureDemoData() {
  if (process.env.SEED_DEMO === "false") return;

  const userCount = await prisma.user.count();
  if (userCount > 0) return;

  const admin = await prisma.user.create({
    data: {
      name: "Aarav Admin",
      email: "admin@example.com",
      passwordHash: await bcrypt.hash("Admin@123", 10),
      role: "ADMIN"
    }
  });

  const member = await prisma.user.create({
    data: {
      name: "Meera Member",
      email: "member@example.com",
      passwordHash: await bcrypt.hash("Member@123", 10),
      role: "MEMBER"
    }
  });

  await prisma.project.create({
    data: {
      name: "Placement Sprint",
      description: "Demo project for team task tracking.",
      members: {
        create: [{ userId: admin.id }, { userId: member.id }]
      },
      tasks: {
        create: [
          {
            title: "Prepare dashboard review",
            description: "Check counts, overdue tasks, and task ownership.",
            status: "IN_PROGRESS",
            dueDate: new Date(Date.now() + 86400000),
            assigneeId: member.id,
            createdById: admin.id
          },
          {
            title: "Finalize deployment checklist",
            description: "Verify Railway URL, README, and demo flow.",
            status: "TODO",
            dueDate: new Date(Date.now() - 86400000),
            assigneeId: admin.id,
            createdById: admin.id
          }
        ]
      }
    }
  });
}

ensureDemoData()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Team Task Manager running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Startup failed", error);
    process.exit(1);
  });
