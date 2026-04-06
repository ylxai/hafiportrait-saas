import { prisma } from '../src/lib/db';
import { hash } from 'bcryptjs';

async function main() {
  // Create admin user
  const hashedPassword = await hash('admin123', 12);
  
  const admin = await prisma.user.upsert({
    where: { email: 'admin@photostudio.com' },
    update: {},
    create: {
      email: 'admin@photostudio.com',
      name: 'Admin',
      password: hashedPassword,
      role: 'admin',
    },
  });

  console.log('Admin user created:', admin.email);

  // Create sample packages
  const packages = [
    { nama: 'Paket Silver', description: 'Paket basic untuk kebutuhan foto standar', price: 500000, duration: 120, fitur: ['1 lokasi', '50 foto', '10 foto edit'] },
    { nama: 'Paket Gold', description: 'Paket premium dengan layanan lengkap', price: 1500000, duration: 240, fitur: ['2 lokasi', '100 foto', '30 foto edit', 'Album'] },
    { nama: 'Paket Platinum', description: 'Paket exclusive untuk wedding', price: 5000000, duration: 480, fitur: ['3 lokasi', 'Unlimited foto', 'Semua foto edit', 'Album hardcover', 'Video highlight'] },
  ];

  for (const pkg of packages) {
    await prisma.package.upsert({
      where: { id: pkg.nama.toLowerCase().replace(' ', '-') },
      update: {},
      create: pkg,
    });
  }

  console.log('Packages created');

  // Create sample settings
  await prisma.settings.upsert({
    where: { id: 'studio' },
    update: {},
    create: {
      id: 'studio',
      namaStudio: 'PhotoStudio',
      phone: '+6281234567890',
      email: 'hello@photostudio.com',
    },
  });

  console.log('Settings created');
  console.log('\n✅ Seed completed!');
  console.log('Login with: admin@photostudio.com / admin123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });