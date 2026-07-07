-- 가망관리(prospect-register) 필드 추가
-- customers 테이블에 교육 도메인 필드 확장: 기관/교육수준/과정유형/과정
alter table public.customers
  add column if not exists institution     text, -- 기관
  add column if not exists education_level  text, -- 교육수준
  add column if not exists course_type      text, -- 과정유형
  add column if not exists course           text; -- 과정

comment on column public.customers.source is '유입경로 (블로그/맘카페/당근마켓/영업/고객지원 등)';
