# Gym / Fitness Studio Specialist

## Positioning

Nudge FitOps is a WhatsApp membership-sales layer for gyms, fitness studios,
and yoga/Zumba centres. It turns enquiries into structured leads by fitness
goal, books free trials, shares membership plans, routes personal-training
interest, and nudges renewals — while escalating any injury or medical topic
to a human trainer.

The goal is not to replace trainers. The assistant filters and books so the
team spends time training members, not chasing WhatsApp leads.

## Operating Plan

1. Goal capture
   Capture `fitness_goal`, preferred program, and timing from the first reply.

2. Trial booking
   Free-trial / day-pass / demo-class requests move to `trial_booked`.

3. Plan discussion
   Membership, price, and duration queries move to `plan_discussed` with
   monthly/quarterly/annual options.

4. Personal training
   Personal-trainer, diet-plan, and transformation requests move to
   `pt_consultation`.

5. Renewals
   Renewal/reactivation requests move to `renewal_due` so expiring members are
   followed up before they lapse.

6. Risk controls
   Injuries, chest pain, heart/medical conditions, pregnancy, and surgery
   escalate to a human trainer. The assistant never gives medical or
   physiotherapy advice and never promises guaranteed weight loss.

## Buyer Impact

- More trials booked: every enquiry is offered a free trial slot.
- Higher conversion: trial-to-join is tracked, not guessed.
- PT upsell: personal-training and diet interest is captured as a stage.
- Fewer lapses: renewal-due members surface for follow-up.
- Safer onboarding: injuries and medical conditions reach a trainer, not a bot.

## Demo Story

1. Open `/demo` and choose `Gym / fitness studio`.
2. Send: `What are your monthly membership plans and price?` → `plan_discussed`.
3. Send: `Can I book a free trial session this weekend?` → `trial_booked`.
4. Send: `I want a personal trainer and diet plan for weight loss` →
   `pt_consultation`.
5. Send: `I have a knee injury and severe chest pain during workout` →
   `escalated` and hands off to a human.

## Implemented Surface

- Backend vertical: `gym`
- Signup option: `Gym / fitness studio`
- Demo login: `gym@demo.nudge / demo1234`
- Seed workspace: `FitZone Studio`
- Pipeline: `new -> enquiry_received -> trial_booked -> pt_consultation
  -> plan_discussed -> membership_joined -> renewal_due -> escalated -> lost`
- Core fields: `fitness_goal`, `preferred_program`, `membership_plan`,
  `trial_date`, `preferred_time`, `batch_preference`, `trainer_preference`,
  `medical_condition`, `joining_date`, `renewal_date`.
- Buyer KPIs: trial bookings, trial-to-join conversion, personal-training uptake,
  plan-discussion rate, memberships joined, renewal backlog, complaint escalations.
- Tests: trial/plan/PT/renewal stage routing, injury/medical escalation.
