import type { CompanyCapabilities } from '@schuco/contracts'

export const CAPABILITY_KEYS = ['manufacturer', 'supplier', 'client', 'platform'] as const

export const hasAnyCapability = (c: CompanyCapabilities) => c.platform || c.manufacturer || c.supplier || c.client

/** The capability keys a company has, in display order — callers translate each via `adminCompanies.typeValue.<key>`. */
export const activeCapabilityKeys = (c: CompanyCapabilities) => CAPABILITY_KEYS.filter((key) => c[key])
