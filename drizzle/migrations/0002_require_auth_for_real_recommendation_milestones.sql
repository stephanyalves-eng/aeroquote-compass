CREATE OR REPLACE FUNCTION public.record_buyer_recommendation(p_milestone_id uuid, p_synthetic boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_milestone_id IS NULL OR p_synthetic IS NULL THEN RAISE EXCEPTION 'Invalid telemetry'; END IF;
  IF NOT p_synthetic AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Real milestones require a signed-in user' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.buyer_recommendation_tracking(id) VALUES (true) ON CONFLICT DO NOTHING;
  INSERT INTO public.buyer_recommendation_milestones(milestone_id, synthetic)
  VALUES (p_milestone_id, p_synthetic) ON CONFLICT (milestone_id) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.record_buyer_recommendation(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_buyer_recommendation(uuid, boolean) TO anon, authenticated, service_role;