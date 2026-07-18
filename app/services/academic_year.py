"""Academic year helpers (India: April–March, label e.g. 2025-26)."""
from datetime import date


def academic_year_for_date(d: date) -> str:
    """Return the academic year string that contains date `d`."""
    if d.month >= 4:
        y0 = d.year
    else:
        y0 = d.year - 1
    return f"{y0}-{str(y0 + 1)[-2:]}"


def current_academic_year(today: date | None = None) -> str:
    return academic_year_for_date(today or date.today())
