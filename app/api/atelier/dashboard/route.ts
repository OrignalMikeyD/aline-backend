import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { AtelierEvent, AtelierDashboardData } from '@/types/atelier'

// Initialize Supabase admin client for data queries
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Helper functions
function aggregateToHourlyBuckets(
  snapshots: Array<{ timestamp: string; value: number }>,
  bucketCount: number
): number[] {
  const now = Date.now()
  const buckets: number[][] = Array.from({ length: bucketCount }, () => [])

  for (const snapshot of snapshots) {
    const snapshotTime = new Date(snapshot.timestamp).getTime()
    const hoursAgo = Math.floor((now - snapshotTime) / (60 * 60 * 1000))
    const bucketIndex = bucketCount - 1 - hoursAgo

    if (bucketIndex >= 0 && bucketIndex < bucketCount) {
      buckets[bucketIndex].push(normalizeToPercent(snapshot.value))
    }
  }

  // Return average per bucket, default to 50 (neutral) if empty
  return buckets.map(bucket =>
    bucket.length > 0
      ? Math.round(bucket.reduce((a, b) => a + b, 0) / bucket.length)
      : 50
  )
}

function normalizeToPercent(value: number): number {
  // Assuming value is already 0-100, adjust if different scale
  return Math.max(0, Math.min(100, value))
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`
  }
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (remainingSeconds === 0) {
    return `${minutes}m`
  }
  return `${minutes}m ${remainingSeconds}s`
}

export async function GET() {
  try {
    // Verify user is authenticated
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // 1. Get sentiment timeseries (last 24 hours, hourly)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data: sentimentSnapshots } = await supabaseAdmin
      .from('atelier_sentiment_snapshots')
      .select('timestamp, value')
      .gte('timestamp', twentyFourHoursAgo)
      .order('timestamp', { ascending: true })

    // Aggregate into 24 hourly buckets, default to 50 (neutral) if no data
    const sentimentData = aggregateToHourlyBuckets(sentimentSnapshots || [], 24)

    // 2. Calculate sentiment velocity
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

    const { data: previousPeriod } = await supabaseAdmin
      .from('atelier_sentiment_snapshots')
      .select('value')
      .gte('timestamp', fortyEightHoursAgo)
      .lt('timestamp', twentyFourHoursAgo)

    const currentAvg = average(sentimentData)
    const previousAvg = previousPeriod?.length
      ? average(previousPeriod.map(s => normalizeToPercent(s.value)))
      : currentAvg

    const sentimentVelocity = previousAvg !== 0
      ? Math.round(((currentAvg - previousAvg) / Math.abs(previousAvg)) * 100)
      : 0

    // 3. Get recent events (artifacts with conversation data)
    const { data: artifacts } = await supabaseAdmin
      .from('atelier_artifacts')
      .select(`
        id,
        type,
        title,
        transcript_excerpt,
        detected_at,
        confidence,
        conversation:atelier_conversations(
          id,
          duration_seconds,
          turn_count
        )
      `)
      .order('detected_at', { ascending: false })
      .limit(20)

    const events: AtelierEvent[] = (artifacts || []).map(artifact => ({
      id: artifact.id,
      time: formatTime(artifact.detected_at),
      type: artifact.type,
      title: artifact.title,
      transcript: artifact.transcript_excerpt || undefined,
      duration: artifact.conversation?.duration_seconds
        ? formatDuration(artifact.conversation.duration_seconds)
        : undefined,
      turns: artifact.conversation?.turn_count || undefined,
      conversationId: artifact.conversation?.id || undefined
    }))

    // 4. Count total artifacts
    const { count: artifactCount } = await supabaseAdmin
      .from('atelier_artifacts')
      .select('*', { count: 'exact', head: true })

    // 5. Check if live (any conversation in last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { count: recentCount } = await supabaseAdmin
      .from('atelier_conversations')
      .select('*', { count: 'exact', head: true })
      .gte('started_at', fiveMinutesAgo)

    const isLive = (recentCount || 0) > 0

    const response: AtelierDashboardData = {
      sentimentData,
      sentimentVelocity,
      events,
      artifactCount: artifactCount || 0,
      isLive
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Dashboard API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    )
  }
}
