-- Editorial moderation: preserve existing published articles, require review for new publication requests.
alter table public.posts add column moderation_status text not null default 'not_submitted'
  check (moderation_status in ('not_submitted', 'pending', 'approved', 'rejected'));
update public.posts set moderation_status = case when status = 'published' then 'approved' else 'not_submitted' end;
create index posts_pending_moderation_idx on public.posts (updated_at desc) where moderation_status = 'pending';

alter policy "Public can read published posts" on public.posts
  using (status = 'published' and moderation_status = 'approved');
alter policy "Authors can create posts" on public.posts with check (
  auth.uid() = author_id and status = 'draft'
  and exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'author'))
);
alter policy "Authors can update own posts" on public.posts
  using (auth.uid() = author_id) with check (auth.uid() = author_id and status = 'draft');
alter policy "Admins can update any post" on public.posts
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (status = 'draft' and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
alter policy "Public can read post_tags for published posts" on public.post_tags
  using (exists (
    select 1 from public.posts where id = post_id and status = 'published' and moderation_status = 'approved'
  ));

-- A new publish request is always stored as a pending draft. Any edit to a live
-- article removes it from public circulation until administrator approval.
create or replace function public.save_post_atomic(
  p_actor_id uuid, p_payload jsonb, p_post_id uuid default null,
  p_expected_updated_at timestamptz default null, p_expected_status text default null,
  p_tag_ids uuid[] default null, p_tag_names jsonb default null,
  p_request_key text default null, p_fingerprint text default null,
  p_chat_id uuid default null, p_allow_admin boolean default false
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_post public.posts; v_existing public.posts; v_request public.post_creation_requests;
  v_role text; v_ids uuid[] := p_tag_ids; v_tag jsonb; v_tag_id uuid; v_id uuid;
  v_content_changed boolean := false;
begin
  -- Serialize alias resolution with tag merges before touching post relationships.
  lock table public.tags in row exclusive mode;
  select role into v_role from public.profiles where id = p_actor_id;
  if v_role is null or v_role not in ('admin', 'author') then raise insufficient_privilege using message = 'Unauthorized'; end if;
  if p_chat_id is not null and not exists (select 1 from public.ai_chats where id = p_chat_id and user_id = p_actor_id) then
    raise insufficient_privilege using message = 'Unauthorized chat';
  end if;
  if p_expected_status is null then
    if p_request_key is not null then
      perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text || ':' || p_request_key, 0));
      select * into v_request from public.post_creation_requests where actor_id = p_actor_id and request_key = p_request_key;
      if found then
        if v_request.fingerprint is distinct from p_fingerprint then raise exception using errcode = '22023', message = 'This creation key was already used with different input.'; end if;
        select * into v_post from public.posts where id = v_request.post_id;
        return jsonb_build_object('post', to_jsonb(v_post), 'replayed', true);
      end if;
    end if;
    v_id := coalesce(p_post_id, gen_random_uuid());
    v_post := jsonb_populate_record(null::public.posts, p_payload);
    if coalesce(v_post.status, 'draft') = 'published' then
      v_post.status := 'draft'; v_post.moderation_status := 'pending'; v_post.published_at := null;
    else
      v_post.moderation_status := coalesce(v_post.moderation_status, 'not_submitted');
    end if;
    insert into public.posts (id,title,slug,excerpt,content,cover_image,cover_image_alt,status,author_id,category_id,seo_title,seo_description,published_at,moderation_status)
    values (v_id,v_post.title,v_post.slug,v_post.excerpt,v_post.content,v_post.cover_image,coalesce(v_post.cover_image_alt,''),coalesce(v_post.status,'draft'),p_actor_id,
      v_post.category_id,v_post.seo_title,v_post.seo_description,v_post.published_at,coalesce(v_post.moderation_status,'not_submitted'))
    returning * into v_post;
  else
    select * into v_existing from public.posts where id = p_post_id for update;
    if not found or (v_existing.author_id is distinct from p_actor_id and not (p_allow_admin and v_role = 'admin')) then
      raise insufficient_privilege using message = 'Unauthorized';
    end if;
    if v_existing.updated_at is distinct from p_expected_updated_at or v_existing.status is distinct from p_expected_status then
      raise exception using errcode = '40001', message = 'The post changed in another editor. Reload before saving.';
    end if;
    v_post := jsonb_populate_record(v_existing, p_payload);
    v_content_changed := v_post.title is distinct from v_existing.title or v_post.slug is distinct from v_existing.slug or
      v_post.excerpt is distinct from v_existing.excerpt or v_post.content is distinct from v_existing.content or
      v_post.cover_image is distinct from v_existing.cover_image or v_post.cover_image_alt is distinct from v_existing.cover_image_alt or
      v_post.category_id is distinct from v_existing.category_id or v_post.seo_title is distinct from v_existing.seo_title or
      v_post.seo_description is distinct from v_existing.seo_description or p_tag_ids is not null or p_tag_names is not null;
    if v_existing.status = 'published' and v_content_changed then
      v_post.status := 'draft'; v_post.moderation_status := 'pending'; v_post.published_at := null;
    end if;
    if coalesce(v_post.status,'draft') = 'published' and coalesce(v_post.moderation_status,'not_submitted') <> 'approved' then
      v_post.status := 'draft'; v_post.moderation_status := 'pending'; v_post.published_at := null;
    end if;
    v_post.moderation_status := coalesce(v_post.moderation_status,'not_submitted');
    update public.posts set title=v_post.title, slug=v_post.slug, excerpt=v_post.excerpt, content=v_post.content,
      cover_image=v_post.cover_image, cover_image_alt=v_post.cover_image_alt, status=v_post.status, category_id=v_post.category_id, seo_title=v_post.seo_title,
      seo_description=v_post.seo_description, published_at=v_post.published_at, moderation_status=v_post.moderation_status,
      updated_at=clock_timestamp()
    where id=p_post_id returning * into v_post;
  end if;
  if p_tag_names is not null then
    v_ids := '{}';
    for v_tag in select value from jsonb_array_elements(p_tag_names) loop
      insert into public.tags (name,slug) values (v_tag->>'name',v_tag->>'slug')
      on conflict (slug) do update set slug=excluded.slug returning id into v_tag_id;
      v_ids := array_append(v_ids,v_tag_id);
    end loop;
  end if;
  if v_ids is not null then
    delete from public.post_tags where post_id=v_post.id;
    insert into public.post_tags(post_id,tag_id)
    select v_post.id, tag_id from (
      select distinct coalesce(t.merged_into, ids.id) as tag_id
      from unnest(v_ids) ids(id) left join public.tags t on t.id = ids.id
    ) tags;
  end if;
  if p_chat_id is not null then insert into public.ai_generated_posts(chat_id,post_id) values(p_chat_id,v_post.id); end if;
  if p_request_key is not null and p_expected_status is null then
    insert into public.post_creation_requests values(p_actor_id,p_request_key,p_fingerprint,v_post.id);
  end if;
  return jsonb_build_object('post',to_jsonb(v_post),'replayed',false);
end;
$$;
revoke all on function public.save_post_atomic(uuid,jsonb,uuid,timestamptz,text,uuid[],jsonb,text,text,uuid,boolean) from public, anon, authenticated;
grant execute on function public.save_post_atomic(uuid,jsonb,uuid,timestamptz,text,uuid[],jsonb,text,text,uuid,boolean) to service_role;
