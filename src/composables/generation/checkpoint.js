import { getGenRun } from '../../services/db-generation'

export async function getResumableRun(projectId) {
  const run = await getGenRun(projectId)
  if (!run || !run.state) return null
  const written = run.state.writtenCount || 0
  const total = Array.isArray(run.state.scenePlan) ? run.state.scenePlan.length : 0
  if (total === 0 || written >= total) return null
  return { written, total, updatedAt: run.updatedAt, projectId }
}
