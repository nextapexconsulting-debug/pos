-- Shop UPI / payment QR image (base64 data URL or public URL)
alter table shop_settings
  add column if not exists payment_qr text;

comment on column shop_settings.payment_qr is
  'Payment scanner image: data:image/... base64 or https URL shown after order for customer pay';
