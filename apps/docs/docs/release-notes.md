---
sidebar_position: 14
title: Release notes
---

# Release notes

What changed, newest first. Use it to see what's new to test.

## November 2026

**Week of 2 November**
- **Product families list, new columns** (from the client's mock-up): **With price list** (Yes / No), **Valid from** and **Valid to** as date fields, **Ready for invoicing** and **In library** (Yes / No) — all changed right in the row.
- **In library**: each company chooses which families (its own or shared with it) its quote builder offers; for other users, families out of the library disappear from the catalog.
- **With price list**: information only; the quote builder marks families without a price list.
- **Partners** page (sidebar): connect with clients and suppliers — **Connect**, **Accept** / **Refuse**, **Remove connection**, with search by name, branch or address. Families can now only be shared with connected companies; companies that already shared families were connected automatically. Removing a connection stops the shares between the two companies.
- **Notifications**: a bell next to your name for connection requests, answers and removals (accept or refuse right there); a request also sends an email.
- **Share dialog**: search box listing only your connected partners.
- New permission `partners.manage` (company admins and managers).
- **Versions and changes** on a family's page: a timeline of all its versions and a tree of what changed between any two of them — added, removed, economic and description changes, each can be hidden; a changed price table shows which sizes got more expensive or cheaper.
- **Version graph** on a family's page: the versions, the copies made from it (each a branch off the version it was copied from) and the family it was copied from; a copy can be compared with its original.
- **Quote builder and versions**: under the family list, what the chosen version changed compared with the previous one; on a position priced from an older version, a **vN available** badge with its changes.
- **Quote builder**: each family in the list shows its version, e.g. “Finestra (v2)”, since two versions can be offered at the same time.
- **Fixes from the 28 October test round**: the password-less demo login is off unless the server turns it on; pages you have no rights for (Users, Company, Audit log, Access rights, and the others in the sidebar) now send you to the Dashboard instead of showing load errors; the Dashboard only offers quick actions you can use; a missing upload file or a malformed address gives a clear error instead of a server error; user statuses are translated; signing out always takes you to the login page; the old demo **Invoice** page is gone (its address opens Quotes).

## October 2026

**Week of 26 October**
- **Ready for invoicing** on product families (Yes / No in the list, the family's page, and the upload and copy dialogs): only ready families are offered in the quote builder. Existing families were marked ready; new ones start not ready, copies and new versions keep the original's setting.
- **Filters on Product families**: search, category, brand, status, price validity, valid-on date, updated range, latest versions only, owner and discount (shared tab), and sorting. They are kept in the page address.
- **Loading indicators on every table**: a placeholder while a page first loads, and a progress bar with “Updating…” while a table reloads after a filter, sort, tab or action — the rows stay visible.

**Week of 20 October**
- **Excel upload in two steps**: the file is checked first and a dialog shows what it holds; then set the name, **price validity** (from/to) and whether to publish. New quote positions only use families whose prices are valid today.
- **Duplicate** a product family now opens the same kind of dialog: name, price validity and publish.
- **Edit users** in *Settings → Users* (pencil on each row): name, roles, active/inactive.
- **Roles page hidden** — custom roles aren't needed for now. Each role's description is in *Settings → Access rights*: click the ⓘ next to the role name.
- **Invoice** removed from the sidebar (it was the old demo editor and got confused with Quotes).

**Week of 13 October**
- **History** on quotes and product families: who changed what, right on the record's page.
- **Audit log**: *Settings → Audit log* (company admins) and *Admin → Audit log* (super-admin) — who changed what, when; sign-ins and failed sign-ins included.
- **Testing docs** (this site): demo logins, URLs, Mailpit, features, pricing, Excel format, screenshots.
- **Demo data**: the *Demo Window W70* product family is created automatically, plus a downloadable sample Excel file.
- **Custom roles**: super-admins can create their own roles.
- **Permission matrix** (*Settings → Access rights*): choose which permissions each role has.
- **Per-family sharing** with a default discount, replacing company-to-company links.
- **Multiple roles per user**, and company capabilities (manufacturer / supplier / client / platform) as checkboxes.
- **Quote position form** redesigned into clear sections.

**Week of 6 October**
- Custom **position name/code** (instead of only P01, P02, …).
- **Live price preview** while adding a position.
- **Manual price (A/M toggle)** per position and per option.

**Week of 29 September**
- Automatic **HTTPS** on the server; Mailpit reachable over HTTPS with a login.
- Automatic deployment after every successful build.

## September 2026

- **Invite approval**: users invited by a company admin wait for a super-admin's approval.
- **Own email + password login** (replacing the previous identity provider), password reset by email.
- **Admin panel**: create, edit, deactivate companies.
- **Quotes**: quote builder and PDF.
- **Product families**: Excel import, editable prices and price tables, versions, publish, delete.
- Tenant isolation, audit log and background jobs (foundations).
