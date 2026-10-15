# Database + Login + Billing setup (all free)

Stack: **Next.js (Vercel free)** + **Supabase free** (PostgreSQL + login). No monthly cost.

## 1. Create the Supabase project (5 min)
1. Go to **https://supabase.com** → **Start your project** → sign up with GitHub or email.
2. **New project** → name `pos`, set a database password (save it), region **Mumbai (ap-south-1)** → Create. Wait ~2 minutes.
3. Left menu → **SQL Editor** → **New query** → paste the whole file `supabase/schema.sql` → **Run**. You should see "Success".
4. **Project Settings → API**: copy **Project URL**, **anon / publishable key**, and **service_role / secret key**.
5. **Authentication → Providers → Email**: for a shop, turn **"Confirm email" OFF** (otherwise every user must click an email link).
   To stop strangers creating shops: **Authentication → Sign In / Providers → turn "Allow new users to sign up" OFF**, then create shops yourself from the Admin page.

## 2. Add keys
Copy `.env.example` → `.env.local` and fill in the Supabase values + a random `CRON_SECRET`.
On Vercel: **Project → Settings → Environment Variables** → add the same names (all 5 + Telegram ones) → redeploy.

## 3. Make yourself the super admin (once)
1. `npm run dev` → open `/login` → **Sign up** with your own email (this temporarily creates a shop for you).
   (If sign-ups are switched off: Supabase → Authentication → Users → **Add user** instead.)
2. Supabase → SQL Editor, run:
   ```sql
   update profiles set role = 'super_admin', shop_id = null where email = 'YOU@EMAIL.COM';
   ```
3. Log out/in → you land on **/admin**.

## 4. Onboard a shop
`/admin` → **Add a new shop + owner login**. Give the owner the email/password. The owner can add staff from **☰ Menu → Staff**.

## What each role sees
| | Super admin (you) | Owner | Staff |
|---|---|---|---|
| POS, take orders, mark Cash/UPI | – | ✔ | ✔ (today only) |
| Expenses, stock, reports, profit | – | ✔ | ✘ |
| Cancel order / undo payment | – | ✔ | ✘ |
| Block shops & users, invoices, usage fee report | ✔ | ✘ | ✘ |

## How blocking works
Blocking is enforced **inside the database** (Row Level Security), not only in the screen. A blocked user, blocked shop, or shop with an overdue invoice can't read or write anything, even with a still-valid login.

## Billing rule (platform fee)
* Every item sold adds **₹0.50** (`shops.fee_per_item`, editable per shop in Admin) to a private `usage_fees` table – one row per order line. Shop users can't read this table; it never appears on the POS, bills or their reports.
* After a month ends, a daily cron (`vercel.json`) creates **one invoice per shop** = sum of fees for that month. The shop sees it under **Billing** (month, items sold, amount, pay-by date).
* **Pay-by date = last day of month + 5 days** (`grace_days`, editable per shop). Example: October usage → invoice 1 Nov → pay by 5 Nov → from 6 Nov the shop is locked if unpaid.
* Owners see a yellow warning banner while an invoice is open, and a lock screen with the amount once it's overdue.
* You tap **Mark paid** in Admin → Invoices → access is restored instantly.
* **Admin → Usage report** gives line-wise detail (date, order #, item, qty, rate, fee) per shop with CSV export.
* No cron? Use **Generate now** in Admin → Invoices. It is safe to press repeatedly.

## What's stored (answers to your 5 points)
| Need | Table | Where in the app |
|---|---|---|
| Bread/pizza carry forward | `stock_counts` (closing) → next day opening | **Stock** page |
| New butter/cheese/bread | `stock_in` (qty, cost) → also auto-creates an expense | **Stock** page |
| Order + Cash/UPI | `orders`, `order_items` (+ `payment_method`, `payment_status`) | POS banner after "Okay", and **Orders** page |
| Sales vs expenses → profit | `orders` − `expenses` | **Today / Profit** |
| Free-text expenses | `expenses` (category + note + amount, any text) | **Today / Profit** |
| 6 months then archive | `archive_*` tables + permanent `daily_summary` | **Reports → Archive** |

## Reports included
Daily profit & loss · Monthly summary · Cash vs UPI vs unpaid · Unpaid orders list · Item-wise sales (best sellers) · Expenses by category · Expense details · Stock movement · Peak hours. All with date ranges, CSV download and print.

## Free-tier reality check
Supabase free = 500 MB DB. A shop doing 200 orders/day ≈ 40 MB per 6 months, so there's plenty of room. Free projects **pause after 7 days of no activity** – a daily shop never hits that, but open the app once a week during holidays.

---

## Migration: Parcel (P), Jain (J) & Editable Orders

After the base schema, run this file once in Supabase → SQL Editor:

`supabase/migration_parcel_jain_edit.sql`

It adds:
- `orders.is_parcel` and `orders.is_jain` columns
- Updated `place_order(..., p_is_parcel, p_is_jain)`
- New `update_order(...)` RPC for editing existing orders
- `daily_summary_for_shop` for the midnight Telegram report

### Daily summary cron (00:00 IST)

Vercel cron hits `/api/cron/daily-summary` at 18:30 UTC (≈ 00:00 IST).

Set env vars:
- `CRON_SECRET` – optional, sent as `Authorization: Bearer …`
- `SUPABASE_SERVICE_ROLE_KEY` – required for the cron to read all shops
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` – already used for orders

### New UI routes
- `/orders/edit` – pick today’s order and change items / P / J
- Menu → Edit Order

---

## Migration: Shop-based menu

Run in Supabase → SQL Editor:

`supabase/migration_shop_menu.sql`

Creates `menu_products` table scoped by `shop_id` (same pattern as orders).

### Behaviour
- Each shop has its own menu
- All staff of that shop share the same menu on every device
- First load with empty menu seeds the built-in defaults once for that shop
- Local cache still used for fast startup; DB is source of truth

### Functions
- `list_menu_products()`
- `upsert_menu_product(...)`
- `delete_menu_product(code)`
- `replace_menu_products(jsonb)` – full replace (import / reset)

Also still run (if not already):
- `migration_parcel_jain_edit.sql`
