export interface AtelierEvent {
  id: string
  time: string
  type: string
  title: string
  transcript?: string
  duration?: string
  turns?: number
  conversationId?: string
}

export interface AtelierDashboardData {
  sentimentData: number[]
  sentimentVelocity: number
  events: AtelierEvent[]
  artifactCount: number
  isLive: boolean
}
