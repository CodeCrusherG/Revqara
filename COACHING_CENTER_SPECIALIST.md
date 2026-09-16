# Coaching Center Specialist

## Positioning

Nudge CoachingOps is an admissions and counselling layer for Indian coaching
centres. It turns WhatsApp enquiries into structured leads by exam family,
class band, batch type, parent/student context, counselling need, fee stage,
scholarship review, and enrolment status.

The goal is not to replace counsellors. The assistant filters, routes, and
prepares leads so counsellors spend time on serious students and parents.

## Course Coverage

- School foundation: classes 6-8, classes 9-10, boards, olympiad, NTSE-style
  foundation.
- Science entrance: JEE Main, JEE Advanced, NEET UG, classes 11-12,
  integrated programs, dropper/repeater batches.
- Civil services: UPSC, IAS/IPS/IFS, state PCS, prelims, mains, interview.
- Government jobs: SSC CGL, SSC CHSL, SSC MTS, SSC GD, banking, IBPS, SBI PO,
  RRB, railway, NDA, CDS, AFCAT.
- MBA and other exams: CAT, XAT, SNAP, NMAT, CMAT, CUET, CLAT, GATE, CA, CS,
  CMA, IELTS, TOEFL, SAT, and other exams.

## Operating Plan

1. Course identification
   Capture `exam_target`, `exam_family`, `class_level`, `class_band`,
   `attempt_year`, `board`, and `stream` from the first WhatsApp reply.

2. Batch matching
   Match the lead to online, offline, hybrid, weekday, weekend, evening,
   morning, residential, integrated, or dropper/repeater batches.

3. Counselling and demo routing
   Demo/trial-class requests go to `demo_scheduled`; parent/student
   counselling requests go to `counselling_booked`.

4. Fee and scholarship handling
   Fee queries go to `fee_discussed`. Scholarship, discount, concession,
   refund, or negotiation topics are escalated to an admissions counsellor.

5. Enrolment closure
   Track documents, payment questions, follow-up date, counsellor owner, and
   final `enrolled` status.

6. Risk controls
   Human handoff is required for refund complaints, scholarship decisions,
   discount negotiation, mental-health/stress topics, and any result/rank
   guarantee claims.

## Buyer Impact

- Lower missed enquiries: WhatsApp messages are sorted by course and stage.
- Faster counsellor response: each lead already has exam, class band, batch
  preference, attempt year, and parent/student context.
- Better sales discipline: owners can see fee-discussion rate, demo bookings,
  counselling bookings, scholarship backlog, and parent follow-up backlog.
- Better course planning: demand is visible by JEE, NEET, school foundation,
  dropper, UPSC, SSC, CAT, and other exam families.
- Safer admissions: the assistant avoids fake rank guarantees and escalates
  sensitive scholarship/refund/stress topics.

## Demo Story

1. Open `/demo` and choose `Coaching institute`.
2. Send: `Fees kitna hai for class 11 JEE weekend batch?`.
   Result: lead enters `fee_discussed`.
3. Send: `NEET dropper batch offline available hai?`.
   Result: lead enters `batch_matched`.
4. Send: `UPSC prelims 2027 ke liye counselling book karni hai`.
   Result: lead enters `counselling_booked`.
5. Send: `SSC CGL aur CAT courses ke details share karo`.
   Result: lead enters `course_identified`.
6. Send: `Worst institute, refund chahiye right now`.
   Result: lead enters `escalated` and hands off to a human.

## Implemented Surface

- Backend vertical: `coaching`
- Demo login: `coaching@demo.nudge / demo1234`
- Seed workspace: `Apex Learning`
- Pipeline: `new -> course_identified -> batch_matched -> demo_scheduled
  -> counselling_booked -> fee_discussed -> scholarship_review
  -> document_pending -> follow_up -> enrolled -> escalated -> lost`
- Core fields: `exam_target`, `exam_family`, `class_band`, `stream`, `board`,
  `attempt_year`, `dropper_status`, `preferred_mode`, `center_location`,
  `scholarship_interest`, `last_score`, `counsellor_owner`, `follow_up_date`.
- Buyer KPIs: course-wise enquiries, demo bookings, counselling bookings,
  fee-discussion rate, scholarship-review backlog, dropper lead volume,
  parent follow-up backlog, and enrolments by exam family.
