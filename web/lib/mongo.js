import { MongoClient } from "mongodb";

const client =
  globalThis.__mongoClient ??
  new MongoClient(process.env.MONGO_URL, { serverSelectionTimeoutMS: 3000 });
if (process.env.NODE_ENV !== "production") globalThis.__mongoClient = client;

export async function dealsCollection() {
  await client.connect(); // no-op if already connected
  return client.db(process.env.MONGO_DB || "comps_engine").collection("deals");
}
