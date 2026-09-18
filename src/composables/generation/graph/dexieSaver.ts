/**
 * A LangGraph checkpointer backed by Dexie.
 *
 * LangGraph saves the graph's state after every superstep through a
 * `BaseCheckpointSaver`. The reference implementation, `MemorySaver`, keeps two
 * maps: `storage[thread][ns][checkpointId] = [checkpoint, metadata, parentId]`
 * and `writes[key] = pending writes`. Rather than re-implement its (subtle)
 * semantics — pending sends, parent chains, the delta history the graph reads
 * on resume — this class *is* a `MemorySaver` whose maps are loaded from and
 * written back to one Dexie row per thread. A killed browser tab therefore
 * resumes at the last completed superstep, which is the property the
 * `PIPELINE_DAG` in `useNovelPipeline` promises for the stages and this
 * extends to the scenes inside the writing stage.
 *
 * Serialized values are `Uint8Array`s (the saver's serde), which IndexedDB's
 * structured clone stores as-is. `Object.create(null)` maps come back with a
 * normal prototype; `MemorySaver` guards every key against prototype
 * pollution before use, so that is safe, but `hydrate` restores the null
 * prototypes anyway to keep the invariant the base class states.
 */
import type { RunnableConfig } from '@langchain/core/runnables'
import {
  MemorySaver,
  type Checkpoint,
  type CheckpointListOptions,
  type CheckpointMetadata,
  type CheckpointTuple,
  type PendingWrite
} from '@langchain/langgraph-checkpoint'
import type { VersatileTable } from '../../../services/db-core'

type StoredEntry = [Uint8Array, Uint8Array, string | undefined]
type ThreadStorage = Record<string, Record<string, StoredEntry>>
type ThreadWrites = Record<string, Record<string, [string, string, Uint8Array]>>

export interface GraphCheckpointRow {
  threadId: string
  projectId: string
  updatedAt: number
  storage: ThreadStorage
  writes: ThreadWrites
}

function nullProto<T extends object>(value: T): T {
  const out = Object.create(null)
  for (const [k, v] of Object.entries(value)) {
    out[k] =
      v && typeof v === 'object' && !ArrayBuffer.isView(v) && !Array.isArray(v) ? nullProto(v) : v
  }
  return out
}

function threadOfKey(key: string): string | null {
  try {
    const parsed = JSON.parse(key)
    return Array.isArray(parsed) ? String(parsed[0]) : null
  } catch {
    return null
  }
}

/** `MemorySaver`'s private maps, as this subclass reads them. */
interface MemoryMaps {
  storage: Record<string, ThreadStorage>
  writes: ThreadWrites
}

export class DexieSaver extends MemorySaver {
  private readonly table: VersatileTable
  private readonly projectId: string
  private readonly hydrated = new Set<string>()

  constructor(table: VersatileTable, projectId: string) {
    super()
    this.table = table
    this.projectId = projectId
  }

  private get maps(): MemoryMaps {
    return this as unknown as MemoryMaps
  }

  private async hydrate(threadId: string | undefined): Promise<void> {
    if (!threadId || this.hydrated.has(threadId)) return
    this.hydrated.add(threadId)
    const row = (await this.table.get(threadId)) as GraphCheckpointRow | undefined
    if (!row) return
    if (row.storage) this.maps.storage[threadId] = nullProto(row.storage)
    for (const [key, entry] of Object.entries(row.writes || {})) {
      this.maps.writes[key] = nullProto(entry)
    }
  }

  private async persist(threadId: string): Promise<void> {
    const writes: ThreadWrites = {}
    for (const [key, entry] of Object.entries(this.maps.writes)) {
      if (threadOfKey(key) === threadId) writes[key] = { ...entry }
    }
    const row: GraphCheckpointRow = {
      threadId,
      projectId: this.projectId,
      updatedAt: Date.now(),
      storage: this.maps.storage[threadId] ?? {},
      writes
    }
    await this.table.put(row)
  }

  override async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    await this.hydrate(config.configurable?.thread_id)
    return super.getTuple(config)
  }

  override async *list(
    config: RunnableConfig,
    options?: CheckpointListOptions
  ): AsyncGenerator<CheckpointTuple> {
    await this.hydrate(config.configurable?.thread_id)
    yield* super.list(config, options)
  }

  override async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata
  ): Promise<RunnableConfig> {
    const threadId = config.configurable?.thread_id
    await this.hydrate(threadId)
    const result = await super.put(config, checkpoint, metadata)
    if (threadId) await this.persist(threadId)
    return result
  }

  override async putWrites(
    config: RunnableConfig,
    writes: PendingWrite[],
    taskId: string
  ): Promise<void> {
    const threadId = config.configurable?.thread_id
    await this.hydrate(threadId)
    await super.putWrites(config, writes, taskId)
    if (threadId) await this.persist(threadId)
  }

  override async deleteThread(threadId: string): Promise<void> {
    await super.deleteThread(threadId)
    this.hydrated.delete(threadId)
    await this.table.delete(threadId)
  }
}
