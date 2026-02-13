require("dotenv").config();

const fs = require("fs");
const path = require("path");
const localtunnel = require("localtunnel");

const port = Number(process.env.PORT || process.argv[2] || 3000);
const subdomain = process.env.TUNNEL_SUBDOMAIN || undefined;
const outFile = path.join(process.cwd(), "tunnel-url.txt");

async function run() {
  console.log(`Opening localtunnel for port ${port}...`);
  const tunnel = await localtunnel({
    port,
    subdomain,
  });

  fs.writeFileSync(outFile, `${tunnel.url}\n`, "utf8");
  console.log(`Tunnel URL: ${tunnel.url}`);
  console.log(`Saved to: ${outFile}`);

  tunnel.on("close", () => {
    console.error("Tunnel closed");
    process.exit(1);
  });

  process.on("SIGINT", async () => {
    await tunnel.close();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await tunnel.close();
    process.exit(0);
  });
}

run().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
