alter table public.pharmacies
  add column if not exists hubspot_total_revenue numeric,
  add column if not exists hubspot_annual_revenue numeric,
  add column if not exists hubspot_last_modified_at timestamptz;

create index if not exists pharmacies_hubspot_revenue_idx
  on public.pharmacies (hubspot_total_revenue desc nulls last)
  where hubspot_company_id is not null;
