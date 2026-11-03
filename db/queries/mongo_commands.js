// =====================================================================
// mongo_commands.js | MongoDB: read, update, delete and aggregate the deals
// Run from the repo root (Docker running):
//   docker compose exec -T mongo mongosh -u comps_admin -p <password> --authenticationDatabase admin comps_engine --quiet < db/queries/mongo_commands.js
// Every change below is undone at the end, so it is safe to run repeatedly.
// =====================================================================

print("\n== READ: Eternal's deals, newest first (uses index ix_ticker_date)");
printjson(db.deals.find(
  { ticker: "ETERNAL.NS" },
  { _id: 0, date: 1, type: 1, headline: 1 }
).sort({ date: -1 }).toArray());

print("\n== READ: all-stock acquisitions (query inside a nested field)");
printjson(db.deals.find(
  { type: "acquisition", "deal.consideration": "stock" },
  { _id: 0, ticker: 1, "deal.target": 1 }
).toArray());

print("\n== READ: full-text search for 'quick commerce' (text index ix_text)");
printjson(db.deals.find(
  { $text: { $search: "quick commerce" } },
  { _id: 0, ticker: 1, headline: 1, score: { $meta: "textScore" } }
).sort({ score: { $meta: "textScore" } }).toArray());

print("\n== UPDATE: add a tag to one deal ($addToSet avoids duplicates)");
printjson(db.deals.updateOne(
  { ticker: "ETERNAL.NS", type: "acquisition", "deal.target": "Blinkit Commerce" },
  { $addToSet: { tags: "demo-tag" }, $set: { reviewed: true } }
));
printjson(db.deals.findOne(
  { "deal.target": "Blinkit Commerce" }, { _id: 0, headline: 1, tags: 1, reviewed: 1 }
));

print("\n== UPDATE (many): flag every IPO as a listing event");
printjson(db.deals.updateMany({ type: "ipo" }, { $set: { listing_event: true } }));

print("\n== VALIDATION: an unknown deal type is rejected by the $jsonSchema validator");
try {
  db.deals.insertOne({ ticker: "X", company_name: "X", sector: "X", date: new Date(),
                       type: "rumour", headline: "should fail" });
} catch (e) {
  print("Rejected: " + e.message);
}

print("\n== DELETE: insert a temporary deal, then delete it");
db.deals.insertOne({ ticker: "TCS.NS", company_name: "Tata Consultancy Services", sector: "IT Services",
                     date: new Date("2026-01-01"), type: "stake_sale", headline: "Temporary demo record" });
printjson(db.deals.deleteOne({ headline: "Temporary demo record" }));

print("\n== AGGREGATE: deal count and disclosed value per sector");
printjson(db.deals.aggregate([
  { $group: { _id: "$sector", deals: { $sum: 1 },
              disclosed_inr_cr: { $sum: { $ifNull: ["$deal.value_inr_cr", 0] } } } },
  { $sort: { deals: -1 } }
]).toArray());

print("\n== AGGREGATE: most common deal themes ($unwind the tags array)");
printjson(db.deals.aggregate([
  { $unwind: "$tags" },
  { $group: { _id: "$tags", count: { $sum: 1 } } },
  { $sort: { count: -1, _id: 1 } },
  { $limit: 5 }
]).toArray());

// Undo the demo changes
db.deals.updateMany({}, { $pull: { tags: "demo-tag" }, $unset: { reviewed: "", listing_event: "" } });
print("\nDemo changes undone. Documents in collection: " + db.deals.countDocuments());
