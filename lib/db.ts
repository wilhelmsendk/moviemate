import { Pool } from 'pg';
const globalDb = globalThis as unknown as { movieMatePool?: Pool; movieMateSchema?: Promise<void> };
export const pool = globalDb.movieMatePool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
globalDb.movieMatePool = pool;
export async function ready() {
  if (!globalDb.movieMateSchema) globalDb.movieMateSchema = pool.query(`
    CREATE TABLE IF NOT EXISTS profiles (id text PRIMARY KEY, name text NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (hash text PRIMARY KEY, user_id text NOT NULL REFERENCES profiles(id), token text NOT NULL, expires timestamptz NOT NULL);
    CREATE TABLE IF NOT EXISTS ratings (user_id text NOT NULL REFERENCES profiles(id), item_id text NOT NULL, value integer NOT NULL CHECK(value IN (-2,1,3)), updated timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,item_id));
    CREATE TABLE IF NOT EXISTS dismissals (user_id text NOT NULL REFERENCES profiles(id), item_id text NOT NULL, expires timestamptz NOT NULL, PRIMARY KEY(user_id,item_id));
    CREATE TABLE IF NOT EXISTS rooms (code text PRIMARY KEY, host_id text NOT NULL REFERENCES profiles(id), guest_id text REFERENCES profiles(id), expires timestamptz NOT NULL);
  `).then(() => {} ).catch(e => { globalDb.movieMateSchema = undefined; throw e; });
  await globalDb.movieMateSchema;
}
