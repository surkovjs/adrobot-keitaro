import type { Reference } from '@/shared/model/reference'

export type OfferRow = {
  offer_id: number
  name: string
  share: number
  removed: boolean
  locked: boolean
}
export type Stream = {
  id: number
  name: string
  position: number
  type: string
  state: string
  schema: string
  action_type: string
  action_options: unknown
  action_payload: string | null
  filters: { name: string; mode: string; payload: unknown }[]
  offers: OfferRow[]
  editable: boolean
  revision: string
}
export type Campaign = Reference & {
  state: string
  alias: string | null
  streams: Stream[]
}
export type CampaignListItem = Reference & {
  state: string
  alias: string | null
}
