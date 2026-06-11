create extension if not exists pgcrypto;

create or replace function normalize_person_name(input text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select regexp_replace(coalesce(input, ''), '[《》“”"''[:space:]]', '', 'g');
$$;

create table if not exists public.game_rounds (
  id text primary key,
  hidden_person text not null,
  status text not null check (status in ('active', 'solved')),
  question_count integer not null default 0,
  solved_by_avatar text,
  solved_by_nickname text,
  solved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists game_rounds_single_active_idx
  on public.game_rounds (status)
  where status = 'active';

create table if not exists public.game_questions (
  id text primary key,
  round_id text not null references public.game_rounds(id) on delete cascade,
  sequence integer not null,
  question text not null,
  player_avatar text not null,
  player_nickname text not null,
  response_type text not null check (response_type in ('judgement', 'hint')),
  judgement text,
  hint text,
  created_at timestamptz not null default now(),
  unique (round_id, sequence)
);

create index if not exists game_questions_round_id_idx
  on public.game_questions (round_id, created_at);

create table if not exists public.game_solved_history (
  id text primary key,
  round_id text not null unique references public.game_rounds(id) on delete cascade,
  person_name text not null,
  normalized_person_name text not null unique,
  question_count integer not null,
  solved_by_avatar text not null,
  solved_by_nickname text not null,
  solved_at timestamptz not null,
  solve_mode text not null check (solve_mode in ('guess', 'reveal'))
);

create index if not exists game_solved_history_solved_at_idx
  on public.game_solved_history (solved_at desc);

create or replace function public.game_ensure_active_round(hidden_person text)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  existing_active_round_id text;
begin
  perform pg_advisory_xact_lock(842071);

  select id
    into existing_active_round_id
  from public.game_rounds
  where status = 'active'
  order by updated_at desc
  limit 1;

  if existing_active_round_id is not null then
    return false;
  end if;

  if hidden_person is null or btrim(hidden_person) = '' then
    raise exception 'hidden_person is required';
  end if;

  insert into public.game_rounds (id, hidden_person, status, question_count, created_at, updated_at)
  values (gen_random_uuid()::text, hidden_person, 'active', 0, now(), now());

  return true;
end;
$$;

create or replace function public.game_submit_question(
  p_question text,
  p_player_avatar text,
  p_player_nickname text,
  p_response_type text,
  p_judgement text default null,
  p_hint text default null,
  p_is_solved boolean default false,
  p_solve_mode text default null,
  p_next_hidden_person text default null,
  p_created_at timestamptz default now()
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_round public.game_rounds%rowtype;
  v_sequence integer;
  v_created_at timestamptz := coalesce(p_created_at, now());
begin
  perform pg_advisory_xact_lock(842071);

  select *
    into v_round
  from public.game_rounds
  where status = 'active'
  order by updated_at desc
  limit 1
  for update;

  if not found then
    raise exception 'No active round';
  end if;

  v_sequence := v_round.question_count + 1;

  insert into public.game_questions (
    id,
    round_id,
    sequence,
    question,
    player_avatar,
    player_nickname,
    response_type,
    judgement,
    hint,
    created_at
  )
  values (
    gen_random_uuid()::text,
    v_round.id,
    v_sequence,
    p_question,
    p_player_avatar,
    p_player_nickname,
    p_response_type,
    p_judgement,
    p_hint,
    v_created_at
  );

  update public.game_rounds
  set
    question_count = v_sequence,
    updated_at = v_created_at
  where id = v_round.id;

  if p_is_solved then
    update public.game_rounds
    set
      status = 'solved',
      solved_by_avatar = p_player_avatar,
      solved_by_nickname = p_player_nickname,
      solved_at = v_created_at,
      updated_at = v_created_at
    where id = v_round.id;

    insert into public.game_solved_history (
      id,
      round_id,
      person_name,
      normalized_person_name,
      question_count,
      solved_by_avatar,
      solved_by_nickname,
      solved_at,
      solve_mode
    )
    values (
      gen_random_uuid()::text,
      v_round.id,
      v_round.hidden_person,
      normalize_person_name(v_round.hidden_person),
      v_sequence,
      p_player_avatar,
      p_player_nickname,
      v_created_at,
      coalesce(p_solve_mode, 'guess')
    )
    on conflict (normalized_person_name) do nothing;

    if p_next_hidden_person is not null and btrim(p_next_hidden_person) <> '' then
      insert into public.game_rounds (
        id,
        hidden_person,
        status,
        question_count,
        created_at,
        updated_at
      )
      values (
        gen_random_uuid()::text,
        p_next_hidden_person,
        'active',
        0,
        v_created_at,
        v_created_at
      );
    end if;
  end if;
end;
$$;

revoke execute on function public.normalize_person_name(text) from public;
revoke execute on function public.game_ensure_active_round(text) from public;
revoke execute on function public.game_submit_question(text, text, text, text, text, text, boolean, text, text, timestamptz) from public;

grant execute on function public.normalize_person_name(text) to service_role;
grant execute on function public.game_ensure_active_round(text) to service_role;
grant execute on function public.game_submit_question(text, text, text, text, text, text, boolean, text, text, timestamptz) to service_role;
