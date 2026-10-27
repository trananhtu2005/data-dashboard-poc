import os

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://test:test@localhost/test")
os.environ.setdefault("JWT_SECRET", "test-secret-long-enough-for-tests-only")
os.environ.setdefault("CONNECTION_ENCRYPTION_KEY", "MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=")
os.environ.setdefault("ADMIN_PASSWORD", "test-admin-password")

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import User
from app.auth import password_hash

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base.metadata.create_all(engine)


def override_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_db
with TestingSession() as db:
    db.add(User(username="test-admin", password_hash=password_hash.hash("test-password-123"), role="admin"))
    db.add(User(username="test-viewer", password_hash=password_hash.hash("test-password-456"), role="viewer"))
    db.commit()


def token(username, password):
    response = TestClient(app).post("/auth/login", data={"username": username, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def test_admin_can_create_users_viewer_cannot_and_logout_revokes_token():
    client = TestClient(app)
    admin_token = token("test-admin", "test-password-123")
    viewer_token = token("test-viewer", "test-password-456")
    assert client.post("/auth/users", headers={"Authorization": f"Bearer {viewer_token}"}, json={"username": "denied", "password": "test-password-789", "role": "viewer"}).status_code == 403
    created = client.post("/auth/users", headers={"Authorization": f"Bearer {admin_token}"}, json={"username": "new-viewer", "password": "test-password-789", "role": "viewer"})
    assert created.status_code == 201
    assert "password_hash" not in created.json()
    assert client.post("/auth/logout", headers={"Authorization": f"Bearer {viewer_token}"}).status_code == 200
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {viewer_token}"}).status_code == 401
