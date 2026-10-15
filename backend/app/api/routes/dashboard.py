from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_organization_id, get_db
from app.schemas.dashboard import DashboardSummaryResponse
from app.services import dashboard_service

router = APIRouter()


@router.get("/dashboard/summary", response_model=DashboardSummaryResponse)
def get_dashboard_summary(
    db: Session = Depends(get_db),
    organization_id: str = Depends(get_current_organization_id),
):
    return dashboard_service.build_summary(db, organization_id)
