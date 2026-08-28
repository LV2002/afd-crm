require("dotenv").config({ path: [".env.local", ".env"] });
const util = require("util");
const postgres = require("postgres");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set even after loading .env.local");
  process.exit(1);
}

const masked = process.env.DATABASE_URL.replace(/:[^:@]*@/, ":****@");
console.log("Using DATABASE_URL:", masked);

const sql = postgres(process.env.DATABASE_URL, { prepare: false });
sql`select 1 as ok`
  .then((r) => {
    console.log("CONNECTED OK", r);
    process.exit(0);
  })
  .catch((e) => {
    console.error("CONNECTION FAILED. Full error object:");
    console.error(util.inspect(e, { depth: 5, colors: false }));
    process.exit(1);
  });
