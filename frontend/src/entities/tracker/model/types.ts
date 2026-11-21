import type { Reference } from '@/shared/model/reference'

export type Catalog = {
  domains: Reference[]
  groups: Reference[]
  sources: Reference[]
  countries: { code: string; name: string }[]
}
export type Health = { configured: boolean; tracker_url: string | null }
