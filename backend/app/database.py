import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

def _resolve_sqlite_url() -> str:
    raw = (os.getenv("DATABASE_URL") or "").strip()
    if raw.startswith("sqlite"):
        return raw
    db_path = (os.getenv("SKOLIX_DB_PATH") or "").strip()
    if not db_path:
        db_path = str(Path(__file__).resolve().parent.parent / "dungrana_school.db")
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{db_path}"


SQLALCHEMY_DATABASE_URL = _resolve_sqlite_url()

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
