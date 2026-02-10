-- Enable Supabase Realtime for leads and sales_metrics tables
-- Run this in the Supabase SQL Editor or via supabase db push

alter publication supabase_realtime add table leads;
alter publication supabase_realtime add table sales_metrics;
