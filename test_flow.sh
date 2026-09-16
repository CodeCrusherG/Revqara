#!/bin/bash
set -e
echo "1. Generating campaign..."
RES=$(curl -s -X POST http://localhost:8000/api/campaigns/generate -H "Content-Type: application/json" -d '{"brief": "Test XDeposit campaign"}')
echo $RES
CAMP_ID=$(echo $RES | grep -o '"campaign_id":"[^"]*' | cut -d'"' -f4)
if [ -z "$CAMP_ID" ]; then echo "Failed to get ID"; exit 1; fi
echo "Campaign ID: $CAMP_ID"

echo "2. Polling for pending_approval..."
for i in {1..20}; do
  STATUS=$(curl -s http://localhost:8000/api/campaigns/$CAMP_ID/status | grep -o '"status":"[^"]*' | cut -d'"' -f4)
  echo "Status: $STATUS"
  if [ "$STATUS" == "pending_approval" ]; then break; fi
  sleep 4
done

echo "3. Approving Campaign..."
curl -s -X POST http://localhost:8000/api/campaigns/$CAMP_ID/approve
echo ""

echo "4. Wait for monitoring..."
for i in {1..10}; do
  STATUS=$(curl -s http://localhost:8000/api/campaigns/$CAMP_ID/status | grep -o '"status":"[^"]*' | cut -d'"' -f4)
  echo "Status: $STATUS"
  if [ "$STATUS" == "completed" ] || [ "$STATUS" == "monitoring" ] || [ "$STATUS" == "executing" ]; then break; fi
  sleep 4
done

echo "5. Triggering Optimize..."
curl -s -X POST http://localhost:8000/api/campaigns/$CAMP_ID/optimize
echo ""
echo "Done testing flow!"
