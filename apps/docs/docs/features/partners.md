---
sidebar_position: 2
title: Partners
---

# Partners

Before two companies can share product families, they connect on the **Partners** page: one asks, the other
accepts. The share dialog only offers connected companies.

**Where:** sidebar → **Partners** · needs `partners.manage` (company admins and managers).

## Tabs

- **Clients** — companies that can receive your families (suppliers and clients). Shown to manufacturers,
  suppliers and the platform company.
- **Suppliers** — companies that can share their families with you (manufacturers, suppliers, the platform
  company). Shown to suppliers and clients.

So a client sees only *Suppliers*, a manufacturer only *Clients*, and a supplier both. Search looks at the
company name, its branch names and addresses; the card shows the address of the company's first branch.

## Connection status

| Status | What you can do |
|---|---|
| Not connected | **Connect** — sends a request |
| Pending | You asked and are waiting — **Withdraw** the request |
| Request received | **Accept request** or **Refuse** |
| Connected | **Remove connection** (asks for confirmation) |

- Asking a company that has already asked you connects you straight away.
- A refused request can be sent again later.
- **Removing a connection stops every family share between the two companies, in both directions** — and,
  as with removing a share, anything they had shared onward from those families.
- Companies that already shared families with each other were connected automatically when this page arrived.

## Notifications

The bell next to your name (top bar on a phone) shows how many notifications are new. You are told when:

- a company asks to connect — with **Accept** / **Refuse** right in the notification;
- your request is accepted or refused;
- a company removes its connection with yours.

Opening the bell marks them read. The Partners page shows the same list on the right. A connection request
also sends an **email** to the admins and managers of the company that was asked (locally: Mailpit).

## How to test

1. As `admin@technometal-demo.it`: *Partners* shows only *Suppliers*. Suppli is **Connected**. Click
   **Connect** on the platform company → it shows **Pending**.
2. As `admin@schuco-demo.it`: the bell shows **1** and the request email is in Mailpit. **Accept** it from the
   bell or from the Partners page.
3. Back as Technometal: the bell says the request was accepted; the card shows **Connected**.
4. As `admin@suppli-demo.it`: **Share** on *Demo Window W70* — the search lists only connected companies.
   If Fabbrikka isn't connected yet, **Connect** with it and accept as `admin@fabbrikka-demo.it`; it then
   appears in the share dialog.
5. **Remove connection** with a company you share families with → after confirming, those families disappear
   from its *Shared with me*.
6. As `sales@technometal-demo.it`: no *Partners* in the sidebar and no bell.
