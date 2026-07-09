-- 학습자 신규(NMS 매출등록) 표에 맞춘 컬럼 추가
alter table public.sales
  add column if not exists manager           text,    -- 담당자
  add column if not exists course_type       text,    -- 과정분류
  add column if not exists course_detail      text,    -- 세부과정
  add column if not exists institution        text,    -- 기관명
  add column if not exists class_start        text,    -- 개강반
  add column if not exists student_id         text,    -- 학생아이디
  add column if not exists customer_name      text,    -- 고객명
  add column if not exists phone              text,    -- 연락처
  add column if not exists education_level    text,    -- 최종학력
  add column if not exists region             text,    -- 지역
  add column if not exists sub_region         text,    -- 세부지역
  add column if not exists practice_schedule  text,    -- 실습예정일
  add column if not exists payment_date       date,    -- 결제일자
  add column if not exists payment_amount     numeric, -- 결제금액
  add column if not exists subject_count      integer, -- 과목수
  add column if not exists special_note       text;    -- 특이사항
