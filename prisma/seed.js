const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('admin123', 12);

  const user = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      password: hashedPassword,
      name: 'Admin User'
    }
  });

  console.log('Seed user created:', user.email);

  // Sample contacts
  const sampleContacts = [
    { email: 'john@example.com', firstName: 'John', lastName: 'Doe', company: 'Acme Inc', tags: 'lead,vip' },
    { email: 'jane@example.com', firstName: 'Jane', lastName: 'Smith', company: 'Tech Corp', tags: 'customer' },
    { email: 'bob@example.com', firstName: 'Bob', lastName: 'Johnson', company: 'StartupXYZ', tags: 'lead' },
    { email: 'alice@example.com', firstName: 'Alice', lastName: 'Williams', company: 'Big Co', tags: 'prospect' },
    { email: 'charlie@example.com', firstName: 'Charlie', lastName: 'Brown', company: 'Small Biz', tags: 'customer,vip' }
  ];

  for (const contact of sampleContacts) {
    await prisma.contact.upsert({
      where: { email: contact.email },
      update: {},
      create: contact
    });
  }

  console.log('Sample contacts created');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
