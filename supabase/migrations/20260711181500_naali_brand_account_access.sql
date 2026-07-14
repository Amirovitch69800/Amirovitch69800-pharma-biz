drop policy if exists "pbr_brand_select" on public.pharmacy_brand_relations;
create policy "pbr_brand_select"
  on public.pharmacy_brand_relations
  for select
  to authenticated
  using (public.has_brand_access(brand_id));

drop policy if exists "brands_select_active_or_access" on public.brands;
create policy "brands_select_active_or_access"
  on public.brands
  for select
  to authenticated
  using (
    public.is_admin()
    or public.current_agent_id() is not null
    or public.has_brand_access(id)
  );

drop policy if exists "products_select_agent_or_brand" on public.products;
create policy "products_select_agent_or_brand"
  on public.products
  for select
  to authenticated
  using (
    public.is_admin()
    or public.current_agent_id() is not null
    or public.has_brand_access(brand_id)
  );
