-- Karne funnel stats (şartname §6 — eksen 1 terk/süre, eksen 3 bant+EU).
-- Run via: pnpm --filter @verimaya/api karne:stats
-- No tenant_id — public lead-magnet tables only.

-- @section overview
SELECT
	count(*)::int AS sessions,
	count(*) FILTER (WHERE completed)::int AS completed,
	round(
		100.0 * count(*) FILTER (WHERE completed) / nullif(count(*), 0),
		1
	) AS completion_pct,
	(
		SELECT count(*)::int
		FROM karne_leads
	) AS leads,
	round(
		100.0 * (SELECT count(*)::int FROM karne_leads)
			/ nullif(count(*) FILTER (WHERE completed), 0),
		1
	) AS email_rate_pct,
	round(
		(
			percentile_cont(0.5) WITHIN GROUP (
				ORDER BY extract(epoch FROM (last_seen_at - started_at)) * 1000
			) FILTER (WHERE completed)
		)::numeric,
		0
	) AS median_session_ms_completed
FROM karne_sessions;

-- @section questions
WITH questions AS (
	SELECT *
	FROM unnest(
		ARRAY['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10']
	) WITH ORDINALITY AS t(question_id, sort_ord)
),
viewed AS (
	SELECT
		question_id,
		count(DISTINCT session_id)::int AS viewed
	FROM karne_events
	WHERE event_type = 'viewed'
		AND question_id IN (
			's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10'
		)
	GROUP BY question_id
),
answered AS (
	SELECT
		question_id,
		count(DISTINCT session_id)::int AS answered,
		round(
			(
				percentile_cont(0.5) WITHIN GROUP (ORDER BY dwell_ms)
					FILTER (WHERE dwell_ms IS NOT NULL)
			)::numeric,
			0
		) AS median_dwell_ms
	FROM karne_events
	WHERE event_type = 'answered'
		AND question_id IN (
			's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10'
		)
	GROUP BY question_id
)
SELECT
	q.question_id,
	coalesce(v.viewed, 0) AS viewed,
	coalesce(a.answered, 0) AS answered,
	round(
		100.0 * (coalesce(v.viewed, 0) - coalesce(a.answered, 0))
			/ nullif(coalesce(v.viewed, 0), 0),
		1
	) AS abandon_pct,
	a.median_dwell_ms
FROM questions q
LEFT JOIN viewed v USING (question_id)
LEFT JOIN answered a USING (question_id)
ORDER BY q.sort_ord;

-- @section band
SELECT
	band,
	count(*)::int AS sessions,
	count(*) FILTER (WHERE completed)::int AS completed
FROM karne_sessions
GROUP BY band
ORDER BY band;

-- @section eu
SELECT
	eu_exposure,
	count(*)::int AS sessions,
	count(*) FILTER (WHERE completed)::int AS completed
FROM karne_sessions
GROUP BY eu_exposure
ORDER BY eu_exposure;
