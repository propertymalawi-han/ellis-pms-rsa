# Ellis Properties – Property Management App

## Purpose
Private web app to manage our residential rental properties in South Africa:
long-term rentals (fixed monthly rent, tenant invoices) and short-term rentals
(income from a monthly owner's statement uploaded by us).

## Tech stack
- Next.js 15 (App Router), TypeScript, Server Actions
- Supabase: Postgres, Auth, Storage, Row Level Security (RLS)
- @supabase/ssr for auth in Next.js
- Tailwind CSS + shadcn/ui, lucide-react icons
- react-hook-form + zod for forms and validation
- Recharts for charts
- @react-pdf/renderer for invoice PDFs
- Hosting: Vercel

## Documents and data entry
- Bills, owner's statements, supplier invoices and proof of payment are uploaded
  and stored against the property and the record they belong to.
- All amounts are entered manually by the user in forms, with the uploaded document
  shown alongside for reference. No automatic/AI extraction for now.

## Locale and conventions
- Currency ZAR, format "R 12 345,67" via Intl.NumberFormat('en-ZA', {style:'currency', currency:'ZAR'})
- Store money as numeric(14,2) in Postgres, never floats in JS calculations (use cents or a decimal lib)
- Dates: en-ZA format, timezone Africa/Johannesburg
- VAT 15% (optional per invoice/expense)
- SA tax year: 1 March – 28/29 February

## Roles
- owner: full access, manages users and settings
- partner: full access to all properties and financials, cannot remove the owner
- property_manager: only properties assigned to them. Can view property basics,
  upload documents, owner's statements and rates/levies bills, mark items paid.
  Cannot see purchase price, bond details, valuations, ROI or the portfolio dashboard.
- For now only the owner logs in (no invites, no public sign-up). Partner and
  property_manager are added later; keep the role column and RLS helpers ready.
- All access enforced with Supabase RLS, not only in the UI.
- Uploads by property managers save directly (no approval step).
- Every create/update/delete is written to an activity_log table.

## Core entities
- profiles (id = auth.users.id, full_name, email, role)
- property_access (user_id, property_id) – for property managers
- properties: name, rental_type (long_term | short_term), property_type
  (freehold | sectional_title), address fields, province, erf/unit/scheme number,
  purchase_price, purchase_date, transfer_costs, improvement_costs, current_value,
  bond_bank, bond_amount, bond_monthly_payment, bond_interest_rate,
  body_corporate_name, municipal_account_number, notes, status (active | sold)
- tenants, leases (long-term only): rent, deposit, start/end, escalation %, escalation date
- invoices + invoice_items, payments (rent from tenants)
- owner_statements (short-term): period, nights_booked, gross_income, platform_fees,
  management_fee, cleaning_fees, other_deductions, net_payout, file
- expenses: category, amount, VAT, due_date, paid_date, status, supplier, file
- rates_levies_bills: period, account number, levy, special_levy, municipal_rates,
  water, electricity, refuse, sewerage, other, arrears, interest, total_due,
  due_date, status, paid_date, amount_paid, bill file, proof of payment file
- documents: property_id, category, file path, uploaded_by
- activity_log

## Statuses
- Invoices: draft | sent | partially_paid | paid | overdue
- Expenses and bills: due | paid | overdue

## ROI definitions
- Total investment = purchase_price + transfer_costs + improvement_costs
- Gross yield = annual rental income / purchase_price
- Net income = annual income - annual operating expenses (excl. bond capital)
- Net yield = net income / total investment
- Cash-on-cash = (net income - annual bond payments) / cash invested
  (cash invested = total investment - bond_amount)
- Capital growth = (current_value - purchase_price) / purchase_price
- Short-term: occupancy = nights_booked / days in month, ADR = gross_income / nights_booked

## Storage buckets (private)
property-documents, statements, bills, invoices. Path: {property_id}/{yyyy}/{filename}.
Access via signed URLs only.

## Coding rules
- Server Components by default; client components only when interactive
- All DB writes in Server Actions with zod validation
- Generate Supabase types into src/types/database.ts and use them everywhere
- Migrations in supabase/migrations, never edit the DB by hand