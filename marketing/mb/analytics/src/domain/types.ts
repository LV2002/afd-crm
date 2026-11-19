// Rows as read from Search Console and Google Analytics, reduced to what the dashboard needs. Dates are yyyy-mm-dd (India time as Google reports it).
export interface GscPageDay { readonly date: string; readonly page: string; readonly clicks: number; readonly impressions: number; readonly position: number }
export interface GscQueryDay { readonly date: string; readonly query: string; readonly clicks: number; readonly impressions: number; readonly position: number }
export interface GscPageQuery { readonly page: string; readonly query: string; readonly clicks: number; readonly impressions: number; readonly position: number }
export interface Ga4PageDay { readonly date: string; readonly page: string; readonly sessions: number; readonly users: number; readonly engagedSessions: number }
export interface Ga4LeadDay { readonly date: string; readonly page: string; readonly leads: number }
export interface Ga4SourceDay { readonly date: string; readonly source: string; readonly sessions: number; readonly users: number }

export type Source = 'gsc-pages' | 'gsc-queries' | 'gsc-page-queries' | 'ga4-pages' | 'ga4-leads' | 'ga4-sources';
