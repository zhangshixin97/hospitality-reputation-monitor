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
  /(?:^|\/)(?:data|private|qa|MediaCrawler|browser_data|node_modules|\.venv)(?:\/|$)|data\.local\.js$|\.env(?:\.|$)|\.zip$/i;
const suspicious =
  /(?:gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY-----|(?:sessionid|web_session|a1)\s*[=:]\s*["'][A-Za-z0-9_-]{20,})/;
const policyPath = path.join(root, "private", "release-policy.json");
const blockedTerms = fs.existsSync(policyPath)
  ? JSON.parse(fs.readFileSync(policyPath, "utf8")).blockedTerms || []
  : [];
function checkText(content, label) {
  if (suspicious.test(content)) throw new Error("疑似凭据：" + label);
  if (blockedTerms.some((term) => content.includes(term)))
    throw new Error("发现业务隐私标识：" + label);
}
for (const file of tracked) {
  if (forbidden.test(file)) throw new Error("发布包含不应上传的文件：" + file);
  checkText(file, "发布文件名");
  checkText(
    execFileSync("git", ["show", ":" + file], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    }),
    "暂存/" + file,
  );
  if (!fs.existsSync(path.join(root, file))) continue;
  checkText(fs.readFileSync(path.join(root, file), "utf8"), file);
}
const commits = execFileSync("git", ["rev-list", "--all"], {
  cwd: root,
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .filter(Boolean);
const seen = new Set();
for (const commit of commits) {
  checkText(
    execFileSync("git", ["show", "-s", "--format=%B", commit], {
      cwd: root,
      encoding: "utf8",
    }),
    "提交说明/" + commit.slice(0, 8),
  );
  const tree = execFileSync(
    "git",
    ["ls-tree", "-r", "-z", "--format=%(objectname) %(path)", commit],
    { cwd: root, encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean);
  for (const entry of tree) {
    const split = entry.indexOf(" "),
      sha = entry.slice(0, split),
      file = entry.slice(split + 1);
    if (forbidden.test(file)) throw new Error("提交历史包含私有文件：" + file);
    checkText(file, "历史文件名");
    if (!seen.has(sha)) {
      checkText(
        execFileSync("git", ["cat-file", "blob", sha], {
          cwd: root,
          encoding: "utf8",
          maxBuffer: 10 * 1024 * 1024,
        }),
        "提交历史/" + file,
      );
      seen.add(sha);
    }
  }
}
console.log(
  `发布检查通过：${tracked.length}个文件、${commits.length}个历史提交；运行数据、业务隐私标识、登录状态和ZIP未进入仓库。`,
);
