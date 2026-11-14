import { Pool } from 'pg';
const globalDb = globalThis as unknown as { movieMatePool?: Pool; movieMateSchema?: Promise<void> };
export const pool = globalDb.movieMatePool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
globalDb.movieMatePool = pool;
export async function ready() {
  if (!globalDb.movieMateSchema) globalDb.movieMateSchema = pool.query(`
    CREATE TABLE IF NOT EXISTS profiles (id text PRIMARY KEY, name text NOT NULL);
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS receive_recommendations boolean NOT NULL DEFAULT false;
    CREATE TABLE IF NOT EXISTS recommendations (
      id text PRIMARY KEY, sender_id text NOT NULL REFERENCES profiles(id),
      recipient_id text NOT NULL REFERENCES profiles(id), item_id text NOT NULL,
      note text NOT NULL DEFAULT '', created timestamptz NOT NULL DEFAULT now(), read_at timestamptz
    );
    CREATE INDEX IF NOT EXISTS recommendations_inbox ON recommendations(recipient_id,created DESC);
    CREATE TABLE IF NOT EXISTS library_snapshots (
      cache_key text PRIMARY KEY, user_id text NOT NULL REFERENCES profiles(id), movies jsonb NOT NULL, updated timestamptz NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (hash text PRIMARY KEY, user_id text NOT NULL REFERENCES profiles(id), token text NOT NULL, expires timestamptz NOT NULL);
    CREATE TABLE IF NOT EXISTS ratings (user_id text NOT NULL REFERENCES profiles(id), item_id text NOT NULL, value integer NOT NULL CHECK(value IN (-2,1,3)), updated timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,item_id));
    CREATE TABLE IF NOT EXISTS dismissals (user_id text NOT NULL REFERENCES profiles(id), item_id text NOT NULL, expires timestamptz NOT NULL, PRIMARY KEY(user_id,item_id));
    CREATE TABLE IF NOT EXISTS rooms (code text PRIMARY KEY, host_id text NOT NULL REFERENCES profiles(id), guest_id text REFERENCES profiles(id), expires timestamptz NOT NULL);
    ALTER TABLE rooms ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0;
    ALTER TABLE rooms ADD COLUMN IF NOT EXISTS selected_item_id text;
    ALTER TABLE rooms ADD COLUMN IF NOT EXISTS selected_at timestamptz;
    CREATE TABLE IF NOT EXISTS room_votes (
      code text NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
      user_id text NOT NULL REFERENCES profiles(id), item_id text NOT NULL,
      PRIMARY KEY(code,user_id,item_id)
    );
  `).then(() => {} ).catch(e => { globalDb.movieMateSchema = undefined; throw e; });
  await globalDb.movieMateSchema;
}
