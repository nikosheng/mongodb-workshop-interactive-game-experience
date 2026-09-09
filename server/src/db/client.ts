import { MongoClient, Db } from 'mongodb';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectDb(): Promise<Db> {
  if (db) return db;

  const uri = process.env['MONGODB_URI'];
  if (!uri) throw new Error('MONGODB_URI environment variable is not set');

  client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });
  await client.connect();
  const dbName = new URL(uri).pathname.replace(/^\//, '') || 'query-quest';
  db = client.db(dbName);
  console.log(`Connected to MongoDB (${dbName})`);
  return db;
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

export function getDb(): Db {
  if (!db) throw new Error('Database not connected. Call connectDb() first.');
  return db;
}
