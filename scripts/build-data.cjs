#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const C = require("../core.js");
const args = process.argv.slice(2);
const flags = new Map();
for (let i = 0; i < args.length; i += 2) {
  if (!args[i]?.startsWith("--") || !args[i + 1])
    throw new Error("参数需使用 --key value");
  flags.set(args[i].slice(2), args[i + 1]);
}
const root = path.resolve(__dirname, "..");
const configPath = path.resolve(
  flags.get("config") || path.join(root, "config.example.json"),
);
const p = C.normalizeProperty(
  JSON.parse(fs.readFileSync(configPath, "utf8")).property,
);
const output = path.resolve(
  flags.get("output") || path.join(root, "data.local.js"),
);
const now = Date.now();
const batches = [],
  channels = [],
  records = [];
function block(html, name, kind) {
  const re = new RegExp(
    "const " +
      name +
      " = (" +
      (kind === "array" ? "\\[[\\s\\S]*?\\]" : "\\{[\\s\\S]*?\\}") +
      ");(?:\\r?\\n|$)",
  );
  const match = html.match(re);
  if (!match) throw new Error("旧页面数据块缺失：" + name);
  return JSON.parse(match[1]);
}
if (flags.has("legacy")) {
  const legacy = path.resolve(flags.get("legacy"));
  const html = fs.readFileSync(legacy, "utf8");
  const snapshot = block(html, "dataSnapshot", "object");
  const observedAt = C.timestamp(snapshot.generatedAt);
  const oldRecords = block(html, "records", "array");
  const fullTexts = new Map();
  for (const sourceFile of snapshot.sourceFiles || []) {
    const file = path.resolve(path.dirname(legacy), sourceFile);
    if (!fs.existsSync(file)) continue;
    const isComment = path.basename(file).startsWith("search_comments");
    const platform = sourceFile.includes("/douyin/") ? "抖音" : "小红书";
    for (const item of readJsonl(file)) {
      const id = String(
        isComment ? item.comment_id : item.aweme_id || item.note_id || "",
      );
      const text = isComment
        ? item.content
        : platform === "抖音"
          ? item.desc || item.title
          : [item.title, item.desc].filter(Boolean).join("\n");
      if (id && String(text || "").trim())
        fullTexts.set(platform + "|" + id, text);
    }
  }
  const textRecords = oldRecords.filter((r) => String(r.content || "").trim());
  for (const r of textRecords)
    records.push(
      C.normalizeRecord(
        {
          ...r,
          content: fullTexts.get(r.platform + "|" + r.sourceId) || r.content,
          mediaPreview: String(r.mediaPreview || "").replace(
            /^抓取试跑数据\//,
            "data/",
          ),
          observedAt,
          firstSeenAt: observedAt,
          evidenceNote:
            "历史采集样本；自动生成的旧处置状态未视为实际人工处置。",
        },
        p,
        { provenance: "历史 MediaCrawler 样本" },
      ),
    );
  batches.push({
    id: "legacy-" + C.hash(legacy + snapshot.generatedAt),
    propertyId: p.id,
    label: `迁移历史采集样本（原始${oldRecords.length}条，${oldRecords.length - textRecords.length}条无文本未纳入）`,
    observedAt,
    importedAt: now,
    count: records.length,
  });
  for (const platform of C.PLATFORMS)
    if (records.some((r) => r.platform === platform))
      channels.push({
        propertyId: p.id,
        platform,
        state: "sample",
        lastSuccessAt: observedAt,
        note: "历史采集样本；最新采集尚未恢复",
      });
}
function loadNormalized(file) {
  const input = JSON.parse(fs.readFileSync(file, "utf8"));
  const normalized = C.normalizeBundle(
    Array.isArray(input)
      ? { records: input, properties: [p] }
      : { ...input, properties: input.properties || [p] },
    p,
  );
  records.push(...normalized.records);
  batches.push(...normalized.batches);
  channels.push(...normalized.channels);
  if (!normalized.batches.length)
    batches.push({
      id: "file-" + C.hash(file + fs.readFileSync(file, "utf8")),
      propertyId: p.id,
      label: path.basename(file),
      importedAt: now,
      observedAt:
        Math.max(0, ...normalized.records.map((r) => r.observedAt || 0)) ||
        null,
      count: normalized.records.length,
    });
}
function readJsonl(file) {
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, i) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`${path.basename(file)}第${i + 1}行不是合法JSON`);
      }
    });
}
function loadRaw(dir) {
  for (const [key, name] of [
    ["douyin", "抖音"],
    ["xhs", "小红书"],
  ]) {
    const folder = path.join(dir, key, "jsonl");
    if (!fs.existsSync(folder)) continue;
    const files = fs
      .readdirSync(folder)
      .filter((f) =>
        /^search_(contents|comments)_\d{4}-\d{2}-\d{2}\.jsonl$/.test(f),
      )
      .sort();
    const parents = new Map();
    const contents = files.filter((f) => f.startsWith("search_contents"));
    for (const file of contents) {
      const observedAt = C.timestamp(
        file.match(/(\d{4}-\d{2}-\d{2})/)[1] + "T00:00:00+08:00",
      );
      for (const item of readJsonl(path.join(folder, file))) {
        const id = String(item.aweme_id || item.note_id || "");
        if (!id) throw new Error(file + "存在缺少内容ID的记录");
        const content =
          key === "douyin"
            ? item.desc || item.title || ""
            : [item.title, item.desc].filter(Boolean).join("\n");
        if (!String(content || "").trim()) continue;
        const sourceUrl =
          C.safeUrl(item.aweme_url) ||
          (key === "douyin"
            ? `https://www.douyin.com/video/${id}`
            : `https://www.xiaohongshu.com/explore/${id}`);
        const preview =
          key === "douyin"
            ? item.cover_url || ""
            : String(item.image_list || "").split(",")[0];
        const r = C.normalizeRecord(
          {
            sourceId: id,
            platform: name,
            content,
            title: item.title || content,
            publishedAt: item.create_time || item.time,
            observedAt,
            sourceUrl,
            sourceAccount: item.nickname,
            mediaPreview: preview,
            metrics: {
              likes: item.liked_count,
              comments: item.comment_count,
              shares: item.share_count,
            },
            source: key === "douyin" ? "搜索视频" : "搜索笔记",
            evidenceNote:
              "采集日期来自文件名，具体完成时刻未记录。封面不等于评论截图。",
          },
          p,
          { provenance: "外部 JSONL 数据" },
        );
        records.push(r);
        parents.set(id, r);
      }
    }
    for (const file of files.filter((f) => f.startsWith("search_comments"))) {
      const observedAt = C.timestamp(
        file.match(/(\d{4}-\d{2}-\d{2})/)[1] + "T00:00:00+08:00",
      );
      for (const item of readJsonl(path.join(folder, file))) {
        if (!item.comment_id) throw new Error(file + "存在缺少评论ID的记录");
        if (!String(item.content || "").trim()) continue;
        const parentId = String(item.aweme_id || item.note_id || ""),
          parent = parents.get(parentId);
        records.push(
          C.normalizeRecord(
            {
              sourceId: item.comment_id,
              parentId,
              platform: name,
              recordKind: "comment",
              source: "一级评论",
              content: item.content,
              publishedAt: item.create_time,
              observedAt,
              sourceUrl: parent?.sourceUrl,
              sourceAccount: parent?.sourceAccount,
              commentAccount: item.nickname,
              parentTitle: parent?.title,
              mediaPreview: parent?.mediaPreview,
              mediaLabel: "源内容封面",
              metrics: {
                likes: item.like_count,
                comments: item.sub_comment_count,
                shares: null,
              },
              evidenceNote:
                "评论需在源内容核对，封面不是该评论的截图；采集日期来自文件名。",
            },
            p,
            { provenance: "外部 JSONL 数据" },
          ),
        );
      }
    }
    const items = records.filter((r) => r.platform === name);
    if (items.length)
      channels.push({
        propertyId: p.id,
        platform: name,
        state: "sample",
        lastSuccessAt: Math.max(...items.map((r) => r.observedAt || 0)),
        note: "外部 JSONL 历史样本，采集日期来自文件名",
      });
  }
}
if (flags.has("input")) {
  const input = path.resolve(flags.get("input"));
  if (fs.statSync(input).isDirectory()) loadRaw(input);
  else loadNormalized(input);
}
if (flags.has("append")) loadNormalized(path.resolve(flags.get("append")));
if (!records.length && flags.get("allow-empty") !== "true")
  throw new Error("未发现有效反馈，已停止更新以保护现有数据");
if (
  fs.existsSync(output) &&
  !flags.has("legacy") &&
  flags.get("replace") !== "true"
) {
  const match = fs
    .readFileSync(output, "utf8")
    .match(/^window\.TRAVEL_PULSE_LOCAL = ([\s\S]*);\s*$/);
  if (!match) throw new Error("现有本地数据格式异常，已停止覆盖");
  const existing = C.normalizeBundle(JSON.parse(match[1]));
  if (existing.properties.some((prop) => prop.id !== p.id))
    throw new Error(
      "现有数据含其他监测对象，当前命令只支持单对象更新，请使用页面导入",
    );
  records.unshift(...existing.records);
  batches.unshift(...existing.batches);
  for (const c of existing.channels) {
    const newer = channels.find((n) => n.platform === c.platform);
    if (
      !newer ||
      (c.lastSuccessAt || 0) > (C.timestamp(newer.lastSuccessAt) || 0)
    )
      channels.push(c);
  }
}
const result = C.normalizeBundle({
  properties: [p],
  records,
  batches,
  channels: [
    ...new Map(
      channels.map((c) => [c.propertyId + "|" + c.platform, c]),
    ).values(),
  ],
});
const js =
  "window.TRAVEL_PULSE_LOCAL = " +
  JSON.stringify(result, null, 2)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029") +
  ";\n";
fs.mkdirSync(path.dirname(output), { recursive: true });
const temp = output + ".tmp";
fs.writeFileSync(temp, js);
fs.renameSync(temp, output);
console.log(
  JSON.stringify(
    {
      output,
      recordCount: result.records.length,
      platforms: Object.fromEntries(
        C.PLATFORMS.map((platform) => [
          platform,
          result.records.filter((r) => r.platform === platform).length,
        ]),
      ),
      latestPublishedAt: C.iso(
        Math.max(...result.records.map((r) => r.publishedAt || 0)),
      ),
      note: "生成时间不会改变实际采集时间",
    },
    null,
    2,
  ),
);
