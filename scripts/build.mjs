// Builds the public cookbook from the Notion "Sweet Natura | Recipe Library" database.
// Only rows whose Status is "Aprobada" or "Publicada" are published; "Aprobada" rows are
// switched to "Publicada" after a successful build. If anything fails, the script exits
// with an error and the previous version of the site stays online. Status changes are
// written by scripts/mark-published.mjs only after the deploy succeeds.
import { mkdir, writeFile, copyFile, rm } from "node:fs/promises";
import { extname } from "node:path";

const TOKEN = process.env.NOTION_TOKEN;
const DB = process.env.NOTION_DATABASE_ID;
const PREVIEW = process.env.COOKBOOK_PREVIEW !== "false"; // banner on until launch is approved
const OUT = "dist";
if (!TOKEN || !DB) throw new Error("Missing NOTION_TOKEN or NOTION_DATABASE_ID");

const api = async (path, body, method = body ? "POST" : "GET") => {
  const res = await fetch("https://api.notion.com/v1/" + path, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Notion ${method} ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
};

const text = (p) => (p?.rich_text || p?.title || []).map((t) => t.plain_text).join("").trim();
const lines = (s) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const slugify = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function parseIngredients(raw) {
  // "## Group" starts a group; "qty | ingredient" or just "ingredient"
  const groups = [{ items: [] }];
  for (const l of lines(raw)) {
    if (l.startsWith("##")) { groups.push({ group: l.replace(/^#+\s*/, ""), items: [] }); continue; }
    const [a, ...b] = l.split("|").map((x) => x.trim());
    groups.at(-1).items.push(b.length ? [a, b.join(" | ")] : ["", a]);
  }
  return groups.filter((g) => g.items.length);
}

async function rows() {
  const out = [];
  let cursor;
  do {
    const r = await api(`databases/${DB}/query`, {
      filter: { or: [{ property: "Status", select: { equals: "Aprobada" } }, { property: "Status", select: { equals: "Publicada" } }] },
      start_cursor: cursor,
    });
    out.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return out;
}

async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Photo download failed (${res.status}) for ${file}`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
}

const today = new Date().toISOString().slice(0, 10);
await rm(OUT, { recursive: true, force: true });
await mkdir(`${OUT}/img`, { recursive: true });

const seenSlug = new Set(), seenReel = new Set(), recipes = [], warnings = [], toPublish = [];
for (const page of await rows()) {
  const p = page.properties;
  const name = text(p["Name"]);
  const slug = text(p["Slug"]) || slugify(name);
  const reel = p["Reel URL"]?.url || "";
  if (!name) { warnings.push(`Row ${page.id} has no name: skipped`); continue; }
  if (seenSlug.has(slug) || (reel && seenReel.has(reel))) { warnings.push(`Duplicate skipped: ${name}`); continue; }
  const ingredients = parseIngredients(text(p["Ingredients"]));
  const steps = lines(text(p["Steps"])).map((s) => s.replace(/^\d+[.)]\s*/, ""));
  if (!ingredients.length || !steps.length) { warnings.push(`${name}: missing ingredients or steps, skipped`); continue; }
  seenSlug.add(slug); if (reel) seenReel.add(reel);

  let img = null;
  const f = p["Photo"]?.files?.[0];
  if (f) {
    const url = f.file?.url || f.external?.url;
    const ext = (extname(new URL(url).pathname) || ".jpg").toLowerCase();
    img = `img/${slug}${ext}`;
    await download(url, `${OUT}/${img}`);
  } else {
    // Fallback: a real photo committed to the repo as site/img/<slug>.jpg
    const local = `site/img/${slug}.jpg`;
    try { await copyFile(local, `${OUT}/img/${slug}.jpg`); img = `img/${slug}.jpg`; }
    catch { warnings.push(`${name}: no photo`); }
  }

  const facts = [];
  for (const [label, prop] of [["Serves", "Servings"], ["Prep", "Prep time"], ["Cook / chill", "Cook or chill time"]]) {
    const v = text(p[prop]); if (v) facts.push([label, v]);
  }
  for (const l of lines(text(p["Extra facts"]))) { const [a, ...b] = l.split("|"); if (b.length) facts.push([a.trim(), b.join("|").trim()]); }

  const status = p["Status"]?.select?.name;
  const added = p["Added to cookbook"]?.date?.start || today;
  recipes.push({
    slug, name, accent: text(p["Title accent"]) || null,
    cats: (p["Category"]?.multi_select || []).map((c) => c.name),
    img, posted: p["Published on IG"]?.date?.start || added, added, reel,
    desc: text(p["Description"]), facts, ingredients, steps,
    tip: text(p["Angye's tips"]) || null, source: text(p["Source"]),
    featured: !!p["Featured"]?.checkbox,
    shop: lines(text(p["Shop links"])).map((l) => l.split("|").map((x) => x.trim())).filter((x) => x.length >= 3 && /^https:\/\//.test(x[2])).map(([match, label, url]) => ({ match, label, url })),
  });
  if (status === "Aprobada") toPublish.push({ id: page.id, added: p["Added to cookbook"]?.date?.start ? null : today });
}

await copyFile("site/index.html", `${OUT}/index.html`);
let hasAngye = true;
for (const f of ["angye-hi.webp", "angye-chef.webp"]) await copyFile(`site/${f}`, `${OUT}/${f}`).catch(() => { hasAngye = false; });
for (const f of ["logo.png", "favicon.png"]) await copyFile(`site/${f}`, `${OUT}/${f}`).catch(() => warnings.push(`Missing site/${f}`));
await writeFile(`${OUT}/recipes.json`, JSON.stringify({ config: { preview: PREVIEW, angye: hasAngye, built: new Date().toISOString() }, recipes }, null, 1));
await writeFile(`${OUT}/.nojekyll`, "");

await writeFile("publish-queue.json", JSON.stringify(toPublish));

console.log(`Built ${recipes.length} recipes (${toPublish.length} newly published).`);
for (const w of warnings) console.log("::warning::" + w);
