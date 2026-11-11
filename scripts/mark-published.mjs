// Runs after a successful deploy: moves "Aprobada" recipes that are now live to "Publicada".
import { readFile } from "node:fs/promises";
const TOKEN = process.env.NOTION_TOKEN;
const queue = JSON.parse(await readFile("publish-queue.json", "utf8"));
for (const r of queue) {
  const properties = { Status: { select: { name: "Publicada" } } };
  if (r.added) properties["Added to cookbook"] = { date: { start: r.added } };
  const res = await fetch(`https://api.notion.com/v1/pages/${r.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${TOKEN}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
    body: JSON.stringify({ properties }),
  });
  if (!res.ok) throw new Error(`Could not mark ${r.id} as Publicada: ${res.status} ${await res.text()}`);
}
console.log(`Marked ${queue.length} recipe(s) as Publicada.`);
