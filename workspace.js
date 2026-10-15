(function (root, factory) {
  if (typeof module === "object" && module.exports)
    module.exports = factory(require("./core.js"));
  else root.TravelWorkspace = factory(root.TravelPulse);
})(typeof globalThis !== "undefined" ? globalThis : this, function (C) {
  "use strict";
  const empty = () => ({
    properties: [],
    records: [],
    batches: [],
    channels: [],
    workflow: {},
    actions: [],
  });
  const fingerprint = (r) => C.hash(r.content + "|" + r.sourceUrl);
  function mergeChannels(channels) {
    const map = new Map();
    for (const next of channels) {
      const key = next.propertyId + "|" + next.platform,
        old = map.get(key);
      const clock = (c) => Math.max(c.lastAttemptAt || 0, c.lastSuccessAt || 0);
      if (!old || clock(next) >= clock(old))
        map.set(key, {
          ...next,
          lastSuccessAt:
            Math.max(old?.lastSuccessAt || 0, next.lastSuccessAt || 0) || null,
        });
    }
    return [...map.values()];
  }
  function normalizeAction(a, properties) {
    if (!C.clean(a.id)) throw new Error("整改事项缺少标识");
    if (!properties.some((p) => p.id === a.propertyId))
      throw new Error("整改项的监测对象不存在");
    if (!C.clean(a.title) || !C.clean(a.owner))
      throw new Error("整改项需要事项和负责人");
    if (!C.timestamp(a.dueAt)) throw new Error("整改项需要有效截止时间");
    const status = ["待整改", "整改中", "已完成"].includes(a.status)
      ? a.status
      : "待整改";
    if (status === "已完成" && !C.clean(a.result))
      throw new Error("完成整改前请记录结果");
    return {
      id: C.clean(a.id, 150),
      propertyId: a.propertyId,
      topic: C.clean(a.topic, 80),
      title: C.clean(a.title, 300),
      owner: C.clean(a.owner, 80),
      dueAt: C.timestamp(a.dueAt),
      status,
      result: C.clean(a.result, 4000),
      createdAt: C.timestamp(a.createdAt),
      updatedAt: C.timestamp(a.updatedAt),
    };
  }
  function normalizeSaved(raw, base) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new Error("工作空间格式错误");
    const properties = (raw.properties || []).map(C.normalizeProperty);
    const allProperties = [
      ...new Map(
        [...base.properties, ...properties].map((p) => [p.id, p]),
      ).values(),
    ];
    const normalized = C.normalizeBundle({
      ...empty(),
      ...raw,
      properties: allProperties,
    });
    const records = C.dedupe([...base.records, ...normalized.records]);
    const ids = new Map(records.map((r) => [r.id, r]));
    const workflow = Object.create(null);
    for (const [id, edit] of Object.entries(raw.workflow || {})) {
      if (!ids.has(id) || !edit || typeof edit !== "object") continue;
      const r = ids.get(id);
      const patch = C.validateWorkflow({ ...r, status: edit.status }, edit);
      workflow[id] = {
        ...patch,
        fingerprint: C.clean(edit.fingerprint, 80),
        history: (Array.isArray(edit.history) ? edit.history : [])
          .slice(-100)
          .map((h) => ({
            at: C.timestamp(h.at),
            status: C.STATUSES.includes(h.status) ? h.status : "待研判",
            owner: C.clean(h.owner, 80),
            note: C.clean(h.note, 4000),
            reply: C.clean(h.reply, 4000),
            review: C.clean(h.review, 4000),
            sentiment: C.clean(h.sentiment, 20),
            riskLevel: C.clean(h.riskLevel, 20),
            verification:
              h.verification === "verified" ? "verified" : "pending",
          })),
      };
    }
    return {
      ...normalized,
      properties,
      workflow,
      actions: (raw.actions || []).map((a) =>
        normalizeAction(a, allProperties),
      ),
    };
  }
  function build(base, saved) {
    const properties = [
      ...new Map(
        [...base.properties, ...saved.properties].map((p) => [p.id, p]),
      ).values(),
    ];
    const propertyMap = new Map(properties.map((p) => [p.id, p]));
    const records = C.dedupe([...base.records, ...saved.records]).map((raw) => {
      const r = C.normalizeRecord(raw, propertyMap.get(raw.propertyId));
      const edit = saved.workflow[r.id];
      if (!edit) return r;
      const changed = edit.fingerprint && edit.fingerprint !== fingerprint(r);
      const merged = changed
        ? {
            ...r,
            owner: edit.owner,
            note: edit.note,
            history: edit.history,
            status: "待研判",
            verification: "pending",
            evidenceChanged: true,
          }
        : { ...r, ...edit };
      merged.feedbackType =
        merged.sentiment === "负面" || merged.riskLevel !== "普通"
          ? "风险"
          : r.feedbackType === "风险"
            ? "普通"
            : r.feedbackType;
      return merged;
    });
    return {
      schemaVersion: 2,
      properties,
      records,
      channels: mergeChannels([...base.channels, ...saved.channels]),
      batches: [
        ...new Map(
          [...base.batches, ...saved.batches].map((b) => [b.id, b]),
        ).values(),
      ],
      actions: saved.actions || [],
    };
  }
  function saveWorkflow(saved, r, data, now) {
    const patch = C.validateWorkflow(r, data);
    const old = saved.workflow[r.id] || {};
    const history = [...(old.history || []), { at: now, ...patch }].slice(-100);
    return {
      ...saved,
      workflow: {
        ...saved.workflow,
        [r.id]: { ...patch, fingerprint: fingerprint(r), history },
      },
    };
  }
  function mergeImport(saved, current, incoming, input, batch, now) {
    if (
      current.batches.some(
        (b) => b.id === batch.id || b.id.startsWith(batch.id + ":"),
      )
    )
      return { saved, duplicate: true, added: 0 };
    const existing = new Map(current.properties.map((p) => [p.id, p]));
    for (const p of incoming.properties)
      if (
        existing.has(p.id) &&
        existing.get(p.id).name !== p.name &&
        !input.workspaceBackup
      )
        throw new Error("监测对象与现有名称冲突：" + p.name);
    const ids = new Set(current.records.map((r) => r.id));
    const added = incoming.records.filter((r) => !ids.has(r.id)).length;
    const properties = [
      ...new Map(
        [...saved.properties, ...incoming.properties].map((p) => [p.id, p]),
      ).values(),
    ];
    const workflow = { ...saved.workflow };
    const actions = [...(saved.actions || [])];
    if (input.workspaceBackup) {
      const restored = normalizeSaved(
        {
          ...incoming,
          workflow: input.workflow || {},
          actions: input.actions || [],
        },
        { ...current, records: [] },
      );
      for (const [id, edit] of Object.entries(restored.workflow)) {
        const old = workflow[id];
        if (
          !old ||
          (edit.history.at(-1)?.at || 0) >= (old.history.at(-1)?.at || 0)
        )
          workflow[id] = edit;
      }
      for (const action of restored.actions) {
        const i = actions.findIndex((a) => a.id === action.id);
        if (i < 0) actions.push(action);
        else if ((action.updatedAt || 0) >= (actions[i].updatedAt || 0))
          actions[i] = action;
      }
    }
    const channels = incoming.channels.length
      ? incoming.channels
      : incoming.properties.flatMap((p) =>
          C.PLATFORMS.filter((platform) =>
            incoming.records.some(
              (r) => r.propertyId === p.id && r.platform === platform,
            ),
          ).map((platform) => ({
            propertyId: p.id,
            platform,
            state: "sample",
            lastSuccessAt:
              Math.max(
                0,
                ...incoming.records
                  .filter(
                    (r) => r.propertyId === p.id && r.platform === platform,
                  )
                  .map((r) => r.observedAt || 0),
              ) || null,
            note: "人工收录样本；持续采集未接入",
          })),
        );
    const batches = incoming.properties.map((p) => ({
      id: batch.id + ":" + p.id,
      propertyId: p.id,
      label: batch.label,
      importedAt: now,
      observedAt:
        Math.max(
          0,
          ...incoming.records
            .filter((r) => r.propertyId === p.id)
            .map((r) => r.observedAt || 0),
        ) || null,
      count: incoming.records.filter((r) => r.propertyId === p.id).length,
    }));
    return {
      saved: {
        ...saved,
        properties,
        records: C.dedupe([...saved.records, ...incoming.records]),
        workflow,
        actions,
        channels: mergeChannels([...saved.channels, ...channels]),
        batches: [...saved.batches, ...batches].slice(-100),
      },
      added,
      duplicate: false,
    };
  }
  return {
    empty,
    fingerprint,
    mergeChannels,
    normalizeAction,
    normalizeSaved,
    build,
    saveWorkflow,
    mergeImport,
  };
});
