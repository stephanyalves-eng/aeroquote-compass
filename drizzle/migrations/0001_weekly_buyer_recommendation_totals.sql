CREATE TABLE public.buyer_recommendation_milestones (
  milestone_id uuid PRIMARY KEY,
  synthetic boolean NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.buyer_recommendation_milestones TO service_role;
ALTER TABLE public.buyer_recommendation_milestones ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.buyer_recommendation_milestones IS 'Append-only public product telemetry, not verified procurement evidence. No RFQ, supplier, commercial or personal values.';
CREATE TABLE public.buyer_recommendation_tracking (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  started_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.buyer_recommendation_tracking TO service_role;
ALTER TABLE public.buyer_recommendation_tracking ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.record_buyer_recommendation(p_milestone_id uuid, p_synthetic boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_milestone_id IS NULL OR p_synthetic IS NULL THEN RAISE EXCEPTION 'Invalid telemetry'; END IF;
  INSERT INTO public.buyer_recommendation_tracking(id) VALUES (true) ON CONFLICT DO NOTHING;
  INSERT INTO public.buyer_recommendation_milestones(milestone_id, synthetic)
  VALUES (p_milestone_id, p_synthetic) ON CONFLICT (milestone_id) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.record_buyer_recommendation(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_buyer_recommendation(uuid, boolean) TO anon, authenticated, service_role;
CREATE FUNCTION public.weekly_buyer_recommendations()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'updatedAt', now(),
    'trackingStartedAt', coalesce((SELECT started_at FROM public.buyer_recommendation_tracking WHERE id), now()),
    'weeks', coalesce((SELECT jsonb_agg(r ORDER BY r.week) FROM (
      SELECT to_char(date_trunc('week', recorded_at AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD') AS week,
        count(*) FILTER (WHERE NOT synthetic) AS real,
        count(*) FILTER (WHERE synthetic) AS demo
      FROM public.buyer_recommendation_milestones GROUP BY 1
    ) r), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.weekly_buyer_recommendations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weekly_buyer_recommendations() TO anon, authenticated, service_role;