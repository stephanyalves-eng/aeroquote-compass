CREATE TABLE public.rfq_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL,
 rfq_number text NOT NULL,
 part_number text NOT NULL,
 status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Analyzing','Completed','Under Negotiation','Awarded')),
 snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rfq_history TO authenticated;
GRANT ALL ON public.rfq_history TO service_role;
ALTER TABLE public.rfq_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read own RFQs" ON public.rfq_history FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Owners create own RFQs" ON public.rfq_history FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Owners update own RFQs" ON public.rfq_history FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Owners delete own RFQs" ON public.rfq_history FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE INDEX rfq_history_owner_date ON public.rfq_history(user_id, updated_at DESC);