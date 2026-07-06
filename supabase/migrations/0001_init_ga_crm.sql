-- GA CRM 초기 스키마
-- 담당자별 데이터 격리(owner_id) + 관리자 전체조회 (RLS)
-- 매출 구조는 학점은행제 매출파일(edu-sales) 형식을 GA에 맞춰 대응

-- ============================================================
-- 1. profiles : 담당자/관리자 계정
-- ============================================================
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text,
  role       text not null default 'agent' check (role in ('agent', 'admin')),
  created_at timestamptz not null default now()
);

-- 회원가입 시 profiles 자동 생성 (기본 role = agent)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', new.email), 'agent');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 현재 로그인 유저가 관리자인지 (RLS 재귀 방지 위해 SECURITY DEFINER)
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ============================================================
-- 2. customers : 고객 DB (수기입력)
-- ============================================================
create table if not exists public.customers (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  name       text not null,
  phone      text,
  birth      date,
  source     text,               -- 가입경로
  notes      text,               -- 메모
  created_at timestamptz not null default now()
);

-- ============================================================
-- 3. sales : 매출/계약 (수기입력) — 학점은행제 매출파일 형식 대응
-- ============================================================
create table if not exists public.sales (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  customer_id    uuid references public.customers(id) on delete set null,
  product        text,           -- 상품명       (← cohort)
  insurer        text,           -- 보험사
  premium        numeric,        -- 월납입료      (← unit_price)
  total_amount   numeric,        -- 총액         (← total_amount)
  commission     numeric,        -- 수수료/환산성적 (GA 추가)
  payment_method text check (payment_method in ('payapp_transfer', 'bank_transfer', 'card')),
  contract_date  date,           -- 청약일       (← payment_date)
  term           integer,        -- 납입기간(개월) (← subject_count)
  policy_number  text,           -- 증권번호      (← process_number)
  status         text not null default '정상'
                 check (status in ('정상', '철회', '실효', '정산', '보류')), -- (← refund_status)
  status_date    date,           -- 상태변경일    (← refund_date)
  notes          text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_customers_owner on public.customers(owner_id);
create index if not exists idx_sales_owner     on public.sales(owner_id);
create index if not exists idx_sales_customer  on public.sales(customer_id);

-- ============================================================
-- 4. RLS : 담당자=자기것만 / 관리자=전체
-- ============================================================
alter table public.profiles  enable row level security;
alter table public.customers enable row level security;
alter table public.sales     enable row level security;

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid());

-- customers : 소유자 또는 관리자
drop policy if exists customers_rw on public.customers;
create policy customers_rw on public.customers
  for all
  using      (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());

-- sales : 소유자 또는 관리자
drop policy if exists sales_rw on public.sales;
create policy sales_rw on public.sales
  for all
  using      (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());
