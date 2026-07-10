-- 매출파일(한평생 오피스 학점은행제 edu-sales 양식) 컬럼 추가
alter table public.sales
  add column if not exists unit_price     numeric,   -- 단가
  add column if not exists process_number text,      -- (현)처리번호
  add column if not exists issue_date     date,       -- (현)발급일자
  add column if not exists is_published   boolean not null default false, -- 발행완료
  add column if not exists refund_status  text not null default '정상',   -- 환불상태
  add column if not exists refund_date    date;       -- 환불일

-- 환불상태 값 제약: 정상 / 당월 환불 / 환불 / 정산 / 보류
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sales_refund_status_check'
  ) then
    alter table public.sales
      add constraint sales_refund_status_check
      check (refund_status in ('정상','당월 환불','환불','정산','보류'));
  end if;
end $$;
