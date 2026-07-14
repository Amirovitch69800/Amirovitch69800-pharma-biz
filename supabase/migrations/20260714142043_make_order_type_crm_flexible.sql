drop view if exists public.v_orders_summary;

alter table public.orders
  alter column order_type type text
  using order_type::text;

create view public.v_orders_summary as
select
  o.id,
  o.order_number,
  o.order_date,
  o.status,
  o.order_type,
  o.total_ht,
  o.total_after_discount_ht,
  o.total_ttc,
  o.agent_id,
  a.display_name as agent_name,
  o.brand_id,
  b.name as brand_name,
  o.pharmacy_id,
  p.name as pharmacy_name,
  p.city as pharmacy_city,
  p.department as pharmacy_department,
  p.groupement as pharmacy_groupement,
  o.created_at,
  o.updated_at
from public.orders o
join public.agents a on a.id = o.agent_id
join public.brands b on b.id = o.brand_id
join public.pharmacies p on p.id = o.pharmacy_id;

grant select on public.v_orders_summary to authenticated;
