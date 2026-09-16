# Restaurant / Cloud Kitchen Specialist

## Positioning

Nudge DineOps is a WhatsApp front-of-house layer for restaurants, cloud
kitchens, and catering businesses. It turns chat enquiries into structured leads
by intent — table reservation, delivery order, or event catering — and routes
food-safety and refund complaints straight to a human manager.

The goal is not to replace the host or kitchen. The assistant captures the
booking, the order, or the catering brief so staff spend time serving guests,
not retyping WhatsApp messages.

## Operating Plan

1. Intent split
   Every enquiry is sorted into dine-in (reservation), delivery (order), or
   catering (event), with menu/price queries answered up front.

2. Reservation capture
   Table requests capture party size, date, time, table preference, and
   occasion, then move to `reservation_booked`.

3. Order capture
   Delivery/takeaway requests capture items, delivery address, and dietary
   preference, then move to `order_placed`.

4. Catering quoting
   Bulk/party/wedding/corporate enquiries capture headcount, event date, and
   budget, then move to `catering_quoted` for the team to price.

5. Risk controls
   Food poisoning, stale/spoiled food, hair/insect/hygiene issues, overcharge,
   and refund topics escalate to a human manager immediately.

## Buyer Impact

- Fewer missed bookings: reservations and orders are captured even at peak hours.
- Faster table turns: each reservation already has party size, time, and occasion.
- Catering pipeline: high-value event enquiries are visible instead of lost in chat.
- Safer service: food-safety and refund complaints reach a manager, not a bot reply.
- Demand visibility: owners see reservations, delivery orders, and catering leads by day.

## Demo Story

1. Open `/demo` and choose `Restaurant / cloud kitchen`.
2. Send: `Table for 4 this Saturday at 8pm?` → lead enters `reservation_booked`.
3. Send: `What's on the menu and price for a veg thali?` → lead enters `menu_shared`.
4. Send: `Need catering for a 200 guest wedding` → lead enters `catering_quoted`.
5. Send: `Found a hair in my food, worst service, I want a refund` →
   lead enters `escalated` and hands off to a human.

## Implemented Surface

- Backend vertical: `restaurant`
- Signup option: `Restaurant / cloud kitchen`
- Demo login: `restaurant@demo.nudge / demo1234`
- Seed workspace: `Spice Garden`
- Pipeline: `new -> menu_shared -> reservation_booked -> order_placed
  -> catering_quoted -> feedback -> escalated -> lost`
- Core fields: `party_size`, `reservation_date`, `reservation_time`,
  `table_preference`, `occasion`, `cuisine_preference`, `order_items`,
  `delivery_address`, `catering_event`, `headcount`, `dietary_preference`.
- Buyer KPIs: table reservations per day, delivery orders captured,
  catering enquiries, average party size, repeat customers,
  complaint escalations, no-show follow-ups.
- Tests: dine-in/delivery/catering stage routing, food-safety/refund escalation.
