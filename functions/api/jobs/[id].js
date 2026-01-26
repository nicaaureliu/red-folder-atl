export async function onRequest(context) {
  const { request, env, params } = context;
  const kv = env.JOBS_KV;
  const jobId = String(params.id || "").trim();

  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") return new Response(null, { headers: cors });

  if (!jobId) {
    return new Response(JSON.stringify({ ok: false, error: "Missing job id" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

  if (request.method === "GET") {
    const raw = await kv.get(`job:${jobId}`);
    if (!raw) {
      return new Response(JSON.stringify({ ok: false, error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }
    return new Response(JSON.stringify({ ok: true, job: JSON.parse(raw) }), {
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

  if (request.method === "PUT") {
    const existingRaw = await kv.get(`job:${jobId}`);
    if (!existingRaw) {
      return new Response(JSON.stringify({ ok: false, error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    const patch = await request.json().catch(() => null);
    if (!patch) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    const existing = JSON.parse(existingRaw);
    const now = Date.now();

    const updated = {
      ...existing,
      ...patch,
      jobId,
      jobName: String(patch.jobName ?? existing.jobName ?? "").trim(),
      projectNumber: String(patch.projectNumber ?? existing.projectNumber ?? jobId).trim(),
      siteLocation: String(patch.siteLocation ?? existing.siteLocation ?? "").trim(),
      workLocation: String(patch.workLocation ?? existing.workLocation ?? "").trim(),
      defaultBriefingBy: String(patch.defaultBriefingBy ?? existing.defaultBriefingBy ?? "").trim(),
      defaultJobTitle: String(patch.defaultJobTitle ?? existing.defaultJobTitle ?? "").trim(),
      crewList: Array.isArray(patch.crewList)
        ? patch.crewList.map(String)
        : (typeof patch.crewList === "string"
            ? patch.crewList.split("\n").map(s => s.trim()).filter(Boolean)
            : existing.crewList),
      updatedAt: now,
    };

    await kv.put(`job:${jobId}`, JSON.stringify(updated));

    // Update index entry
    const indexRaw = (await kv.get("jobs:index")) || "[]";
    const index = JSON.parse(indexRaw);
    const idx = index.findIndex(j => j.jobId === jobId);
    const entry = { jobId, jobName: updated.jobName, updatedAt: now };
    if (idx >= 0) index[idx] = { ...index[idx], ...entry };
    else index.push(entry);
    await kv.put("jobs:index", JSON.stringify(index));

    return new Response(JSON.stringify({ ok: true, job: updated }), {
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

  if (request.method === "DELETE") {
    await kv.delete(`job:${jobId}`);

    const indexRaw = (await kv.get("jobs:index")) || "[]";
    const index = JSON.parse(indexRaw).filter(j => j.jobId !== jobId);
    await kv.put("jobs:index", JSON.stringify(index));

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

  return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json", ...cors },
  });
}
