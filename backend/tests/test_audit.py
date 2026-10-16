import json
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.db.init_db import init_db
from app.db.session import SessionLocal
from app.main import app
from app.models.audit_event import AuditEvent
from app.models.investigation import Investigation
from app.models.invoice import Invoice
from app.repositories import audit_repository, investigation_repository

client = TestClient(app)

ORG = "org_1"
OTHER_ORG = "org_2"
AUDIT_URL = "/api/v1/audit/events"
INV_URL = "/api/v1/investigations"


@pytest.fixture(autouse=True)
def _clean():
    init_db()
    db = SessionLocal()
    try:
        for model in (AuditEvent, Investigation, Invoice):
            db.query(model).delete()
        db.commit()
    finally:
        db.close()
    yield


def _seed_invoice(org=ORG):
    db = SessionLocal()
    try:
        invoice = Invoice(
            id=str(uuid.uuid4()),
            organization_id=org,
            invoice_number=f"INV-{uuid.uuid4().hex[:8]}",
            currency="INR",
            total_amount=Decimal("100.00"),
        )
        db.add(invoice)
        db.commit()
        return invoice.id
    finally:
        db.close()


def _insert(
    db,
    *,
    action="review_decision",
    entity_id="inv-1",
    entity_type="investigation",
    org=ORG,
    when=None,
    details=None,
    actor="demo-user",
):
    event = AuditEvent(
        id=str(uuid.uuid4()),
        organization_id=org,
        actor_id=actor,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        details_json=json.dumps(details) if details is not None else None,
        created_at=when or datetime.now(timezone.utc),
    )
    db.add(event)
    db.commit()
    return event.id


# --- read API ---------------------------------------------------------------


def test_empty_trail_returns_an_empty_page():
    body = client.get(AUDIT_URL).json()
    assert body == {"total": 0, "skip": 0, "limit": 100, "items": []}


def test_lists_events_newest_first_and_parses_details():
    db = SessionLocal()
    try:
        base = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        _insert(db, action="investigation_created", when=base, details={"a": 1})
        _insert(db, action="investigation_run", when=base + timedelta(seconds=1))
        _insert(db, action="review_decision", when=base + timedelta(seconds=2))
    finally:
        db.close()

    body = client.get(AUDIT_URL).json()
    assert body["total"] == 3
    actions = [item["action"] for item in body["items"]]
    assert actions == [
        "review_decision",
        "investigation_run",
        "investigation_created",
    ]

    created = body["items"][-1]
    assert created["details"] == {"a": 1}
    assert created["entity_type"] == "investigation"
    assert created["actor_id"] == "demo-user"


def test_details_that_are_not_an_object_degrade_to_null():
    db = SessionLocal()
    try:
        db.add(
            AuditEvent(
                id=str(uuid.uuid4()),
                organization_id=ORG,
                entity_type="investigation",
                entity_id="x",
                action="review_decision",
                details_json="[1, 2, 3]",
            )
        )
        db.add(
            AuditEvent(
                id=str(uuid.uuid4()),
                organization_id=ORG,
                entity_type="investigation",
                entity_id="y",
                action="review_decision",
                details_json="not-json",
            )
        )
        db.commit()
    finally:
        db.close()

    body = client.get(AUDIT_URL).json()
    assert body["total"] == 2
    assert all(item["details"] is None for item in body["items"])


def test_filters_narrow_results():
    db = SessionLocal()
    try:
        _insert(db, action="review_decision", entity_id="inv-1")
        _insert(db, action="investigation_run", entity_id="inv-1")
        _insert(db, action="investigation_run", entity_id="inv-2")
    finally:
        db.close()

    by_action = client.get(AUDIT_URL, params={"action": "review_decision"}).json()
    assert by_action["total"] == 1

    by_entity = client.get(AUDIT_URL, params={"entity_id": "inv-1"}).json()
    assert by_entity["total"] == 2

    by_both = client.get(
        AUDIT_URL, params={"entity_id": "inv-1", "action": "investigation_run"}
    ).json()
    assert by_both["total"] == 1

    by_type = client.get(AUDIT_URL, params={"entity_type": "investigation"}).json()
    assert by_type["total"] == 3

    missing = client.get(AUDIT_URL, params={"entity_type": "invoice"}).json()
    assert missing["total"] == 0


def test_pagination_skip_and_limit():
    db = SessionLocal()
    try:
        base = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        for index in range(5):
            _insert(db, when=base + timedelta(seconds=index), entity_id=f"inv-{index}")
    finally:
        db.close()

    first = client.get(AUDIT_URL, params={"limit": 2, "skip": 0}).json()
    assert first["total"] == 5
    assert first["skip"] == 0
    assert first["limit"] == 2
    assert len(first["items"]) == 2

    last = client.get(AUDIT_URL, params={"limit": 2, "skip": 4}).json()
    assert len(last["items"]) == 1


def test_events_are_organization_scoped():
    db = SessionLocal()
    try:
        _insert(db, org=ORG, entity_id="mine")
        _insert(db, org=OTHER_ORG, entity_id="theirs")
    finally:
        db.close()

    body = client.get(AUDIT_URL).json()
    assert body["total"] == 1
    assert body["items"][0]["entity_id"] == "mine"
    assert body["items"][0]["organization_id"] == ORG


def test_invalid_pagination_is_rejected():
    assert client.get(AUDIT_URL, params={"skip": -1}).status_code == 422
    assert client.get(AUDIT_URL, params={"limit": 0}).status_code == 422
    assert client.get(AUDIT_URL, params={"limit": 201}).status_code == 422


def test_audit_endpoint_is_read_only():
    methods = set()
    for route in app.routes:
        if getattr(route, "path", "") == AUDIT_URL:
            methods |= set(getattr(route, "methods", set()))
    assert "GET" in methods
    assert not methods.intersection({"POST", "PUT", "PATCH", "DELETE"})


# --- emission ---------------------------------------------------------------


def test_creating_an_investigation_records_an_audit_event():
    invoice_id = _seed_invoice()

    resp = client.post(INV_URL, json={"invoice_id": invoice_id})
    assert resp.status_code == 201, resp.text
    investigation_id = resp.json()["id"]

    body = client.get(AUDIT_URL, params={"entity_id": investigation_id}).json()
    assert body["total"] == 1
    event = body["items"][0]
    assert event["action"] == "investigation_created"
    assert event["entity_type"] == "investigation"
    assert event["details"]["invoice_id"] == invoice_id


def test_update_investigation_commits_audit_event_in_the_same_transaction():
    invoice_id = _seed_invoice()
    db = SessionLocal()
    try:
        investigation = investigation_repository.create_investigation(
            db, ORG, created_by="demo-user", invoice_id=invoice_id
        )
        event = audit_repository.build_event(
            organization_id=ORG,
            entity_type="investigation",
            entity_id=investigation.id,
            action="investigation_run",
            actor_id="demo-user",
            details={"status": "completed", "report_version": 1},
        )
        investigation_repository.update_investigation(
            db, investigation, audit_event=event, status="completed", report_version=1
        )

        stored = db.query(AuditEvent).filter_by(action="investigation_run").one()
        assert stored.entity_id == investigation.id
        assert json.loads(stored.details_json)["status"] == "completed"
    finally:
        db.close()


def test_update_investigation_rolls_back_audit_event_on_failure(monkeypatch):
    invoice_id = _seed_invoice()
    db = SessionLocal()
    investigation_id = None
    try:
        investigation = investigation_repository.create_investigation(
            db, ORG, created_by="demo-user", invoice_id=invoice_id
        )
        investigation_id = investigation.id

        event = audit_repository.build_event(
            organization_id=ORG,
            entity_type="investigation",
            entity_id=investigation.id,
            action="investigation_run",
            actor_id="demo-user",
            details={"status": "completed"},
        )

        def boom():
            raise RuntimeError("commit failed")

        monkeypatch.setattr(db, "commit", boom)
        with pytest.raises(RuntimeError):
            investigation_repository.update_investigation(
                db, investigation, audit_event=event, status="completed"
            )
    finally:
        db.close()

    verify = SessionLocal()
    try:
        reloaded = investigation_repository.get_investigation(
            verify, ORG, investigation_id
        )
        assert reloaded.status == "pending"
        assert verify.query(AuditEvent).filter_by(action="investigation_run").count() == 0
    finally:
        verify.close()
