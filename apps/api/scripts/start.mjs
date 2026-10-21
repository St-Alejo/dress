// Arranque del contenedor: migraciones y luego la API.
//
// Con RESEED_ONCE=1 recarga el catálogo de demo sin necesidad de SSH, pero solo si hace falta: cuando
// la migración real_photos_only aún no está aplicada (exige foto en cada prenda, así que el catálogo
// viejo la haría fallar) o cuando no hay prendas. Vacía las mismas tablas que vacía el seed (catálogo,
// pruebas, reseñas y métricas; las cuentas se conservan), migra y corre el seed. Si la variable se
// queda puesta, los arranques siguientes no borran nada.
import { execSync } from 'node:child_process';
import pg from 'pg';

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
const GATE = '20261010150000_real_photos_only';
const CATALOG = ['TryOnSession', 'FitReview', 'BodyModelPreview', 'SizeChartEntry', 'Garment', 'BodyModel', 'BrandCalibration', 'Brand', 'MetricEvent'];

async function needsReseed(client) {
  const applied = await client.query(
    `SELECT 1 FROM "_prisma_migrations" WHERE migration_name = $1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    [GATE],
  );
  if (applied.rowCount === 0) return true;
  const garments = await client.query('SELECT count(*)::int AS n FROM "Garment"');
  return garments.rows[0].n === 0;
}

let reseed = false;
if (process.env.RESEED_ONCE === '1') {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    reseed = await needsReseed(client);
    if (reseed) {
      console.log('[start] RESEED_ONCE: se vacía el catálogo de demo antes de migrar');
      await client.query(`TRUNCATE ${CATALOG.map((t) => `"${t}"`).join(', ')} CASCADE`);
    } else {
      console.log('[start] RESEED_ONCE: el catálogo ya está al día, no se borra nada');
    }
  } finally {
    await client.end();
  }
}

run('npx prisma migrate deploy');
if (reseed) run('npm run db:seed');
await import('../dist/main.js');
