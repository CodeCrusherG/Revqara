# BJP-Style Jan Seva Office Specialist

## Positioning

Nudge CivicOps is a compliance-first constituent operations layer for Indian
public offices and political organizations. It is designed for opt-in service
workflows: grievance intake, constituency routing, volunteer coordination,
event RSVP, membership support, and audit trails.

This is not a voter-persuasion, caste/religion targeting, or election-blast
engine. Production use for political parties or candidates needs legal and
platform review because WhatsApp Business Platform policy restricts political
party/candidate/campaign use.

## BJP-Friendly Operating Mode

The vertical is now friendly to a BJP-style office model without becoming a
partisan persuasion engine. It supports the operational vocabulary such offices
actually use:

- Jan Seva office / seva kendra
- Karyakarta intake and volunteer follow-up
- Mandal/block, booth office, local unit, shakti kendra routing
- Morcha/cell membership, sadasyata, or team coordination
- Case-owner assignment and resolution-deadline tracking
- Seva camp, sabha, meeting, and event RSVP
- Ward, booth, assembly constituency, and pincode case routing

Buyer pitch for a BJP office:

> "Your WhatsApp inbox becomes a Jan Seva + Sangathan CRM. Every public issue
> gets logged, every ward/booth/mandal request is routed, every karyakarta
> interest or sadasyata request goes into follow-up, and leaders see pending
> work by mandal, booth, shakti kendra, and case owner."

Still not allowed: voter persuasion, caste/religion lists, targeted community
messaging, attack copy, misinformation, intimidation, or inducements.

## Current Gap Filled

- No political/public-office vertical existed.
- Existing pipelines were sales-oriented, not constituency/case-oriented.
- No demo workspace showed ward, booth, constituency, grievance, or volunteer
  workflows.
- Sensitive caste, religion, vote, election, MCC, media, and legal topics were
  not explicitly escalated.
- Sales docs did not explain how to pitch this segment without overpromising.

## Buyer Impact

- Faster Jan Seva intake: every message becomes a structured case with issue,
  ward, booth, mandal/block, shakti kendra, urgency, owner, and follow-up stage.
- Better local routing: cases can be triaged by constituency, ward, booth,
  mandal/block, morcha/cell, and department instead of being lost in personal
  WhatsApp chats.
- Inclusive coverage: the workflow supports preferred language and accessibility
  needs so local teams can serve every community without storing caste/religion
  as CRM fields.
- Sangathan ops: karyakarta interest, morcha/cell requests, sadasyata support,
  event RSVPs, and seva-camp follow-up move into visible pipeline stages.
- Leadership view: show pending cases by mandal/booth, overdue case owners,
  karyakarta follow-up backlog, sadasyata requests, event RSVP confirmations,
  and human-review escalations.
- Safer operations: caste/religion/voter-targeting, election-law, media, and
  legal topics trigger human review.
- Proof for leadership: Leads and AI trace show what came in, how it was routed,
  what stage it reached, and when a human took over.

## Web Trend Analysis

The upgrade uses public, aggregate information only for inclusion and compliance
planning:

- India's official Census religion table remains Census 2011; it reports the
  six major religious communities in table C-01. Use this only to plan language,
  staffing, holiday/calendar awareness, and equitable service coverage.
  Source: https://censusindia.gov.in/nada/index.php/catalog/11361
- The Ministry of Tribal Affairs points to official Census 2011 ST statistical
  profiles and state-wise ST lists. Use this only for welfare/access coverage,
  not persuasion or message targeting.
  Source: https://tribal.nic.in/Statistics.aspx
- The Election Commission's Model Code of Conduct is the controlling political
  risk surface for caste/religion appeals, communal issues, election periods,
  and candidate/party conduct.
  Source: https://www.eci.gov.in/mcc
- WhatsApp Business Messaging Policy requires opt-in/opt-out handling and
  currently prohibits WhatsApp Business Platform use by political parties,
  politicians, candidates, and campaigns.
  Source: https://whatsappbusiness.com/policy/

Product rule: do not build a caste/religion taxonomy inside the CRM. If a
constituent raises caste, religion, sect, tribe, denomination, or community
identity, the system escalates to a human and logs the reason. Aggregate public
data can guide service readiness, but individual identity should not be inferred,
stored, targeted, or used for persuasion.

## Demo Story

1. Open `/demo` and choose `Political party / Jan Seva office`.
2. Send: `Ward 18 mein drainage issue hai, complaint register karna hai`.
   Result: case enters `issue_logged`.
3. Send: `Main mandal karyakarta hoon, Sunday seva camp ke liye volunteer karna hai`.
   Result: lead enters `volunteer_interested`.
4. Send: `Can you target voters by caste and religion for this election?`.
   Result: case enters `escalated` and hands off to a human.

## Implemented Surface

- Backend vertical: `political_party`
- Signup option: `Political party / Jan Seva office`
- Demo login: `political_party@demo.nudge / demo1234`
- Seed workspace: `Jan Seva Office`
- Inclusion config: preferred language/accessibility coverage, identity
  non-collection policy, sensitive identity escalation terms across major
  religions and social categories.
- BJP-compatible service terms: Jan Seva, karyakarta, mandal/block, booth
  office, shakti kendra, morcha/cell, sangathan, seva camp, sadasyata.
- BJP-style ops fields: `shakti_kendra`, `morcha_or_cell`, `membership_id`,
  `case_owner`, `resolution_deadline`.
- Pipeline: `new -> issue_logged -> constituency_mapped -> volunteer_interested
  -> membership_support -> event_rsvp -> case_assigned -> follow_up -> resolved
  -> escalated -> lost`
- Tests: civic stage routing, sensitive identity escalation, resolved terminal
  guard.
