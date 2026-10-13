"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const vm = require("node:vm");
test("数据构建保持历史采集时间，增量去重，空批次不覆盖", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "travel-pulse-test-"));
  try {
    const config = path.join(dir, "config.json"),
      input = path.join(dir, "feedback.json"),
      output = path.join(dir, "data.local.js");
    fs.writeFileSync(
      config,
      JSON.stringify({
        property: { id: "hotel1", name: "测试酒店", kind: "hotel" },
      }),
    );
    const record = {
      platform: "携程",
      sourceId: "id1",
      content: "房型不符",
      observedAt: "2026-08-04T09:00:00+08:00",
    };
    fs.writeFileSync(input, JSON.stringify([record]));
    const run = () =>
      spawnSync(
        process.execPath,
        [
          path.resolve(__dirname, "../scripts/build-data.cjs"),
          "--config",
          config,
          "--input",
          input,
          "--output",
          output,
        ],
        { encoding: "utf8" },
      );
    assert.equal(run().status, 0);
    const read = () => {
      const box = { window: {} };
      vm.runInNewContext(fs.readFileSync(output, "utf8"), box);
      return box.window.TRAVEL_PULSE_LOCAL;
    };
    assert.equal(read().records[0].observedAt, Date.parse(record.observedAt));
    fs.writeFileSync(
      input,
      JSON.stringify([
        { ...record, likes: 8, observedAt: "2026-10-13T09:00:00+08:00" },
      ]),
    );
    assert.equal(run().status, 0);
    assert.equal(read().records.length, 1);
    assert.equal(read().records[0].metrics.likes, 8);
    assert.equal(read().records[0].firstSeenAt, Date.parse(record.observedAt));
    const before = fs.readFileSync(output, "utf8");
    fs.writeFileSync(input, "[]");
    assert.notEqual(run().status, 0);
    assert.equal(fs.readFileSync(output, "utf8"), before);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
