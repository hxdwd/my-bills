-- 020: 饮食控制数据层升级
-- 仅新增「原子追加」RPC + 清理第一版遗留的单一 key。
-- 不新建任何表；user_expand 已是 KV 结构（key/value 列，(user_id,key) 复合主键），
-- 本迁移不改动表结构、不触碰 life_data 等其它 key。

-- 原子追加一条饮食记录到「按月切片」的 key：
--   key 形如 diet_control_records_2026-07
--   value 为目标月字典 { [itemId]: DietRecord[] }
-- 使用 jsonb_set + || 在原地原子追加，避免前端「读-改-写整包」导致的多端并发覆盖。
create or replace function public.append_diet_record(
  p_key text,
  p_item_id text,
  p_record jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.get_current_user_id();
begin
  insert into public.user_expand (user_id, key, value)
  values (
    v_uid,
    p_key,
    jsonb_build_object(p_item_id, jsonb_build_array(p_record))
  )
  on conflict (user_id, key) do update
  set value = jsonb_set(
    public.user_expand.value,
    array[p_item_id],
    coalesce(public.user_expand.value -> p_item_id, '[]'::jsonb)
      || jsonb_build_array(p_record)
  );
end;
$$;

grant execute on function public.append_diet_record(text, text, jsonb) to anon, authenticated;

-- 清理第一版遗留的单一 key（diet_control 已拆分为 diet_control_items + diet_control_records_YYYY-MM）
delete from public.user_expand where key = 'diet_control';
