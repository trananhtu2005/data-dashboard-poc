import pytest
from fastapi import HTTPException

from app.main import read_query


@pytest.mark.parametrize("query", ["SELECT 1", "SELECT name FROM users LIMIT 2"])
def test_read_query_accepts_select_and_limits(query):
    assert "LIMIT 1000" in read_query(query)


@pytest.mark.parametrize("query", [
    "DELETE FROM users",
    "UPDATE users SET name = 'x'",
    "SELECT 1; SELECT 2",
    "SELECT 1 INTO output_table",
    "SELECT pg_sleep(1)",
    "DROP TABLE users",
])
def test_read_query_rejects_writes_multiple_statements_and_blocked_functions(query):
    with pytest.raises(HTTPException) as exc:
        read_query(query)
    assert exc.value.status_code == 422
