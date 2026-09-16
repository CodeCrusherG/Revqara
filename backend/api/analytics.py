from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
from db.database import get_db
from db.models import ApiCallLog

router = APIRouter()

@router.get("/analytics/quota")
@router.get("/campaigns/quota")
def get_quota_usage(db: Session = Depends(get_db)):
    """
    Returns real-time API quota usage for the current day.
    The simulated daily budget is 100 calls per day per endpoint.
    """
    today = date.today()
    logs = db.query(ApiCallLog).filter(ApiCallLog.date_utc == today).all()
    
    # We have 3 main endpoints: get_customer_cohort, send_campaign, get_report
    # Total limit = 3 * 100 = 300 calls
    used = sum(log.call_count for log in logs)
    total_limit = 300
    
    return {
        "used": used,
        "limit": total_limit,
        "percentage": round((used / total_limit) * 100, 1) if total_limit > 0 else 0,
        "details": [{"endpoint": log.endpoint, "count": log.call_count} for log in logs]
    }
