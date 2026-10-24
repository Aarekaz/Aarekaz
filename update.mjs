#!/usr/bin/env node

// Fills the marked sections of README.md from anuragd.me's public feeds, so
// "Now" and "Writing" stay current without editing this repo. Runs daily from
// .github/workflows/update.yml; `node update.mjs` works locally too.

import { readFileSync, writeFileSync } from "node:fs"

const SITE = "https://www.anuragd.me"

async function text(path) {
  const res = await fetch(`${SITE}${path}`)
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  return res.text()
}

const section = (md, heading) => md.split(`\n## ${heading}\n`)[1]?.split("\n## ")[0].trim() ?? ""
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
const month = (date) => new Date(date).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })

async function now() {
  const [md, books] = await Promise.all([text("/api/md/now"), text("/api/md/shelf/books")])
  const focus = section(md, "Focus")
  const reading = books.split("\n## ").slice(1).find((b) => /Status: currently reading/.test(b))
  const updated = md.match(/Last updated (\d{4}-\d{2}-\d{2})/)?.[1]
  const lines = [focus]
  if (reading) lines.push(`Reading *${reading.split("\n")[0].trim()}*.`)
  if (updated) lines.push(`<sub>From [/now](${SITE}/now), updated ${new Date(updated).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}.</sub>`)
  return lines.join("\n\n")
}

async function writing() {
  const rss = await text("/rss.xml")
  const items = [...rss.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 4).map(([, item]) => ({
    title: decode(item.match(/<title>([\s\S]*?)<\/title>/)[1]),
    link: item.match(/<link>([\s\S]*?)<\/link>/)[1],
    date: item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)[1],
  }))
  if (!items.length) throw new Error("rss.xml has no posts")
  return [...items.map((p) => `- [${p.title}](${p.link}) · ${month(p.date)}`), "", `[All writing →](${SITE}/blog)`].join("\n")
}

function fill(readme, name, body) {
  const pattern = new RegExp(`(<!-- ${name}:start -->)[\\s\\S]*?(<!-- ${name}:end -->)`)
  if (!pattern.test(readme)) throw new Error(`README.md has no ${name} markers`)
  return readme.replace(pattern, `$1\n${body}\n$2`)
}

const [nowBody, writingBody] = await Promise.all([now(), writing()])
const before = readFileSync("README.md", "utf8")
const after = fill(fill(before, "now", nowBody), "writing", writingBody)
writeFileSync("README.md", after)
console.log(after === before ? "README.md is current" : "README.md updated")
