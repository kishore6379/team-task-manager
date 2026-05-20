Team Task Manager - Full Stack Placement Assignment

Live URL:
Add your Railway live URL here after deployment.

GitHub Repository:
Add your GitHub repository link here after pushing.

Overview:
Team Task Manager is a full-stack web application for managing projects, assigning tasks, tracking status, and viewing dashboard progress. It includes authentication, role-based access control, SQL database relationships, validations, and a clean responsive UI.

Tech Stack:
- Frontend: React, Vite, CSS
- Backend: Node.js, Express.js
- Database: PostgreSQL
- ORM: Prisma
- Authentication: JWT + bcrypt password hashing
- Deployment: Railway

Features:
- Signup and login
- First registered user automatically becomes Admin
- Later users become Members
- Admin can create and delete projects
- Admin can add team members to projects
- Admin can create, assign, and delete tasks
- Admin can update user roles
- Members can view accessible projects and tasks
- Members can update status for assigned tasks
- Dashboard shows project count, total tasks, todo, in-progress, done, and overdue tasks
- REST APIs with request validation

Demo Accounts:
Demo users are created automatically on first app start when the database is empty. Set SEED_DEMO=false if you want to disable this.

Admin:
Email: admin@example.com
Password: Admin@123

Member:
Email: member@example.com
Password: Member@123

Local Setup:
1. Install dependencies:
npm install

2. Create a .env file:
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public"
JWT_SECRET="use-a-long-random-secret"
PORT=3000

3. Push database schema:
npm run db:push

4. Optional manual demo data if you disabled automatic seeding:
npm run db:seed

5. Start the app:
npm run dev

Open:
http://localhost:5173

Railway Deployment:
1. Push this project to GitHub.
2. Go to Railway and create a new project from the GitHub repository.
3. Add a PostgreSQL database service in Railway.
4. In the app service variables, add:
DATABASE_URL = Railway PostgreSQL connection URL
JWT_SECRET = any long random string
5. Deploy. Railway will use the Dockerfile. It will:
- install dependencies
- build the React frontend
- run Prisma db push
- start the Express server
6. Open the generated Railway domain and test signup/login.

Important API Routes:
- POST /api/auth/signup
- POST /api/auth/login
- GET /api/dashboard
- GET /api/users
- PATCH /api/users/:id/role
- GET /api/projects
- POST /api/projects
- PATCH /api/projects/:id
- DELETE /api/projects/:id
- GET /api/tasks
- POST /api/tasks
- PATCH /api/tasks/:id/status
- DELETE /api/tasks/:id

Role-Based Access:
- Admin: full project, team, task, role, and dashboard access
- Member: read assigned/access projects and update status of own assigned tasks

Demo Video Flow:
1. Open the deployed Railway URL.
2. Login as admin@example.com / Admin@123.
3. Show dashboard cards and overdue task count.
4. Create a project and add a member.
5. Create a task, assign it to the member, and set a due date.
6. Open Team tab and show Admin/Member roles.
7. Logout and login as member@example.com / Member@123.
8. Show limited member access.
9. Update assigned task status.
10. End by showing the dashboard updated.
