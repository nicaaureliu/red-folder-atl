export async function onRequest(context) {
  const { request, env } = context;
  const kv = env.JOBS_KV;

  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  if (request.method === "GET") {
    // List jobs
    const indexRaw = (await kv.get("jobs:index")) || "[]";
    const index = JSON.parse(indexRaw);

    // Return newest first
    index.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    return new Response(JSON.stringify({ ok: true, jobs: index }), {
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

  if (request.method === "POST") {
    // Create job
    const body = await request.json().catch(() => null);
    if (!body) return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), { status: 400, headers: { "Content-Type": "application/json", ...cors } });

    // Required: jobId (e.g. 836) + jobName
    const jobId = String(body.jobId || "").trim();
    const jobName = String(body.jobName || "").trim();

    if (!jobId || !jobName) {
      return new Response(JSON.stringify({ ok: false, error: "jobId and jobName are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    const now = Date.now();
    const job = {
      jobId,
      jobName,
      projectNumber: String(body.projectNumber || jobId).trim(),
      siteLocation: String(body.siteLocation || "").trim(),
      workLocation: String(body.workLocation || "").trim(),
      defaultBriefingBy: String(body.defaultBriefingBy || "").trim(),
      defaultJobTitle: String(body.defaultJobTitle || "").trim(),
      crewList: Array.isArray(body.crewList) ? body.crewList.map(String) : String(body.crewList || "").split("\n").map(s => s.trim()).filter(Boolean),
      createdAt: now,
      updatedAt: now,
    };

    // Save job
    await kv.put(`job:${jobId}`, JSON.stringify(job));

    // Update index
    const indexRaw = (await kv.get("jobs:index")) || "[]";
    const index = JSON.parse(indexRaw);

    const existingIdx = index.findIndex(j => j.jobId === jobId);
    const indexEntry = { jobId, jobName, updatedAt: now };

    if (existingIdx >= 0) index[existingIdx] = { ...index[existingIdx], ...indexEntry };
    else index.push(indexEntry);

    await kv.put("jobs:index", JSON.stringify(index));

    return new Response(JSON.stringify({ ok: true, job }), {
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

  return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json", ...cors },
  });
}
