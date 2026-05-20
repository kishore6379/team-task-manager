const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash("Admin@123", 10);
  const memberPassword = await bcrypt.hash("Member@123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      name: "Aarav Admin",
      email: "admin@example.com",
      passwordHash: adminPassword,
      role: "ADMIN"
    }
  });

  const member = await prisma.user.upsert({
    where: { email: "member@example.com" },
    update: {},
    create: {
      name: "Meera Member",
      email: "member@example.com",
      passwordHash: memberPassword,
      role: "MEMBER"
    }
  });

  const project = await prisma.project.create({
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

  console.log(`Seeded ${project.name}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
