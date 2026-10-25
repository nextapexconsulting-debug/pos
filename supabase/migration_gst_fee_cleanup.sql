-- GST settings, Rs 1/order fee, delete orders before 2026-10-14
-- Menu, stock, expenses, customers, settings stay intact

alter table shop_settings
  add column if not exists gstin text,
  add column if not exists shop_state text default 'Gujarat',
  add column if not exists gst_rate numeric(5,2) default 5,
  add column if not exists invoice_prefix text default 'INV';

alter table shops add column if not exists fee_per_order numeric(10,2) default 1;
update shops set fee_per_order = coalesce(nullif(fee_per_order, 0), 1);

-- Remove order data strictly before 14 Oct 2026
delete from usage_fees
 where order_id in (select id from orders where order_date < '2026-10-14');

delete from order_items
 where order_id in (select id from orders where order_date < '2026-10-14');

delete from orders where order_date < '2026-10-14';

delete from archive_order_items
 where order_id in (select id from archive_orders where order_date < '2026-10-14');

delete from archive_orders where order_date < '2026-10-14';
