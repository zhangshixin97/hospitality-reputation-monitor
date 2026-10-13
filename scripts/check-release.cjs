"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const tracked = execFileSync("git", ["ls-files", "-z"], {
  cwd: root,
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);
if (!tracked.length) throw new Error("先将发布文件加入Git暂存区");
const forbidden =
  /(?:^|\/)(?:data|private|qa|MediaCrawler|browser_data|node_modules|\.venv)(?:\/|$)|data\.local\.js$|\.env(?:\.|$)|\.zip$/;
const suspicious =
  /(?:gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY-----|(?:sessionid|web_session|a1)\s*[=:]\s*["'][A-Za-z0-9_-]{20,})/;
for (const file of tracked) {
  if (forbidden.test(file)) throw new Error("发布包含不应上传的文件：" + file);
  if (!fs.existsSync(path.join(root, file))) continue;
  if (suspicious.test(fs.readFileSync(path.join(root, file), "utf8")))
    throw new Error("疑似凭据：" + file);
}
console.log(
  `发布检查通过：${tracked.length}个文件，运行数据、登录状态和ZIP未进入仓库。`,
);
