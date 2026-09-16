# Automobile Dealer / Service Specialist

## Positioning

Nudge AutoOps is a WhatsApp lead layer for car and two-wheeler dealerships and
service centres. It handles both sides of the business: sales (model info, test
drives, on-road quotes, finance/exchange) and service (appointments for repair
and maintenance) — while escalating manufacturing defects and legal/accident
topics to a human.

The goal is not to replace sales advisors or service managers. The assistant
captures the model interest or the service need so the team spends time closing
and servicing, not retyping WhatsApp threads.

## Operating Plan

1. Sales vs service split
   Every enquiry is sorted into a sales lead (buying) or a service request
   (existing vehicle).

2. Model sharing
   Model/variant/fuel/feature queries move to `model_shared`.

3. Test drive booking
   Test-drive / demo-drive requests move to `test_drive_booked`.

4. Quoting
   On-road price, EMI, loan, exchange, and downpayment queries move to
   `quote_shared` (figures are indicative, confirmed at the showroom).

5. Service booking
   Service, repair, breakdown, and maintenance requests move to
   `service_booked` with the vehicle and service type captured.

6. Risk controls
   Manufacturing defects, refunds, accident claims, consumer-court/legal
   topics, and delivery-delay disputes escalate to a human. The assistant never
   guarantees loan approval, exchange value, or delivery dates.

## Buyer Impact

- More test drives: every hot lead is offered a slot.
- Cleaner quotes: each quote lead already has model, variant, finance/exchange.
- Service throughput: service requests are captured with vehicle and issue.
- Model-wise demand: sales leads are visible by model and variant.
- Safer handling: defects and legal/accident topics reach a human, not a bot.

## Demo Story

1. Open `/demo` and choose `Automobile dealer / service`.
2. Send: `Can I book a test drive for the Creta this Sunday?` → `test_drive_booked`.
3. Send: `What's the on-road price and EMI for the petrol variant?` → `quote_shared`.
4. Send: `My car AC is not cooling, need a service appointment` → `service_booked`.
5. Send: `Worst dealer, manufacturing defect in my new car, I want a refund` →
   `escalated` and hands off to a human.

## Implemented Surface

- Backend vertical: `automobile`
- Signup option: `Automobile dealer / service`
- Demo login: `automobile@demo.nudge / demo1234`
- Seed workspace: `DriveLine Motors`
- Pipeline: `new -> model_shared -> test_drive_booked -> quote_shared
  -> service_booked -> booking_confirmed -> escalated -> lost`
- Core fields: `interest_type`, `vehicle_model`, `variant`, `fuel_type`,
  `transmission`, `budget`, `exchange_vehicle`, `finance_required`,
  `test_drive_date`, `preferred_showroom`, `service_type`,
  `vehicle_reg_number`, `service_date`.
- Buyer KPIs: test-drive bookings, quote-to-booking conversion, service
  appointments, finance/exchange enquiries, model-wise demand, complaint escalations.
- Tests: model/test-drive/quote/service stage routing, defect/refund escalation.
