import { characterSchema } from './character'
import { locationSchema } from './location'
import { plotThreadSchema } from './plotThread'

export const entitySchemaRegistry = {
  character: characterSchema,
  location: locationSchema,
  plotThread: plotThreadSchema
}
