import { getVoiceProfile as _getVoiceProfile } from '../../config/voiceProfiles'
import { buildSceneContext as _buildSceneContext } from '../sceneContextService'
import { getDimensionNames as _getDimensionNames } from '../../config/evalDimensions'
import { summarizeLog as _summarizeLog } from '../../utils/promptUtils'

export async function getVoiceProfile(profileName: string | null): Promise<string | null> {
  if (!profileName) return null
  const result = _getVoiceProfile(profileName, '')
  return result?.voiceInstruction ?? null
}

export async function buildSceneContext(sceneBrief: any): Promise<string> {
  return _buildSceneContext(sceneBrief)
}

export async function getDimensionNames(workspaceType?: string): Promise<string[]> {
  return _getDimensionNames(workspaceType)
}

export function summarizeLog(chapterLog: string[]): string {
  return _summarizeLog(chapterLog)
}
