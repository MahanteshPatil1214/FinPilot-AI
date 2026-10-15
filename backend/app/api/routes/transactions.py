from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from app.api.deps import get_current_organization_id
from app.db.session import get_db
from app.repositories.transaction_repository import (
    create_transactions,
    find_existing_references,
    get_transaction,
    list_transactions,
)
from app.services.csv_importer import CSVValidationError, parse_transactions_csv
from app.schemas.transaction import TransactionResponse
from typing import List
import logging
import os
import uuid

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_UPLOAD_BYTES = 10 * 1024 * 1024


@router.post("/transactions/import")
async def import_transactions(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    organization_id: str = Depends(get_current_organization_id),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    ext = os.path.splitext(file.filename.lower())[1]
    if ext != ".csv":
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=422, detail="CSV file is empty")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large (limit {MAX_UPLOAD_BYTES // (1024 * 1024)}MB)",
        )

    try:
        parsed = parse_transactions_csv(content)
    except CSVValidationError as e:
        raise HTTPException(
            status_code=422,
            detail={"message": e.message, "errors": e.errors},
        )

    rows = parsed["rows"]
    total_rows = parsed["total_rows"]

    batch_id = str(uuid.uuid4())
    existing = find_existing_references(
        db, organization_id, [r["transaction_reference"] for r in rows]
    )

    seen: set = set()
    to_insert = []
    duplicates = 0
    for row in rows:
        reference = row["transaction_reference"]
        if reference in seen or reference in existing:
            duplicates += 1
            continue
        seen.add(reference)
        to_insert.append(row)

    try:
        transaction_ids = create_transactions(
            db,
            to_insert,
            organization_id=organization_id,
            import_batch_id=batch_id,
        )
    except Exception as e:
        # Log only the error type: DBAPI error messages can embed the failing
        # SQL parameters (transaction amounts/descriptions), which must not be logged.
        logger.error("Bank transaction import failed (error: %s)", type(e).__name__)
        raise HTTPException(status_code=500, detail="Failed to import transactions")

    logger.info(
        "Imported %d transaction(s), skipped %d duplicate(s) of %d row(s)",
        len(transaction_ids),
        duplicates,
        total_rows,
    )

    return {
        "total_rows": total_rows,
        "imported": len(transaction_ids),
        "duplicates": duplicates,
        "batch_id": batch_id,
        "transaction_ids": transaction_ids[:10],
    }


@router.get("/transactions", response_model=List[TransactionResponse])
def get_transactions(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    organization_id: str = Depends(get_current_organization_id),
):
    return list_transactions(db, organization_id, skip=skip, limit=limit)


@router.get("/transactions/{transaction_id}", response_model=TransactionResponse)
def get_transaction_detail(
    transaction_id: str,
    db: Session = Depends(get_db),
    organization_id: str = Depends(get_current_organization_id),
):
    txn = get_transaction(db, organization_id, transaction_id)
    if txn is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return txn
