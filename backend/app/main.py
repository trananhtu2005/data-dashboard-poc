from typing import Annotated, Literal

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import create_access_token, get_current_user, oauth2_scheme, password_hash, require_admin, require_analyst, revoked_tokens
from jwt import decode

from app.config import settings
from app.database import get_db
from app.models import AuditLog, Chart, Dashboard, DashboardChart, DatabaseConnection, Dataset, SavedQuery, User
from sqlalchemy.exc import IntegrityError

import sqlglot
from sqlglot import exp

app = FastAPI(title="Data Dashboard API")
app.add_middleware(CORSMiddleware, allow_origins=[origin.strip() for origin in settings.cors_origins.split(",")], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


class UserResponse(BaseModel):
    id: int
    username: str
    role: Literal["admin", "analyst", "viewer"]


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=100, pattern=r"^[A-Za-z0-9_.-]+$")
    password: str = Field(min_length=12, max_length=128)
    role: Literal["admin", "analyst", "viewer"]


class ConnectionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    uri: str = Field(min_length=1, max_length=2048)


class ConnectionResponse(BaseModel):
    id: int
    name: str
    db_type: str
    status: str


class QueryRequest(BaseModel):
    connection_id: int
    sql: str = Field(min_length=1, max_length=20000)


class QuerySave(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    sql: str = Field(min_length=1, max_length=20000)


class QueryResponse(BaseModel):
    id: int
    name: str
    sql: str


class DatasetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    connection_id: int
    source_type: Literal["table", "sql"]
    source_ref: str = Field(min_length=1, max_length=20000)


class DatasetResponse(BaseModel):
    id: int
    name: str
    source_type: str
    source_ref: str
    columns: list
    column_metadata: dict = {}
    status: str


class ChartCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    dataset_id: int
    config: dict


class ChartResponse(BaseModel):
    id: int
    name: str
    dataset_id: int
    config: dict


class DashboardCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: str | None = Field(default=None, max_length=5000)
    tags: list[str] = Field(default_factory=list)


class DashboardChartAdd(BaseModel):
    chart_id: int
    position: dict = Field(default_factory=dict)


class DashboardShareRequest(BaseModel):
    password: str | None = Field(default=None, min_length=6, max_length=128)


class DashboardResponse(BaseModel):
    id: int
    name: str
    description: str | None
    tags: list[str]
    owner_id: int | None
    owner_username: str | None
    charts: list[dict]
    share_token: str | None = None
    created_at: str
    updated_at: str


class DatasetMetadataUpdate(BaseModel):
    columns: dict[str, dict] = Field(default_factory=dict)
    metrics: dict[str, dict] = Field(default_factory=dict)


class DashboardFilter(BaseModel):
    field: str
    operator: Literal["eq", "contains"] = "eq"
    value: str = Field(max_length=200)


def seal(value: str) -> str:
    from cryptography.fernet import Fernet

    return Fernet(settings.connection_encryption_key.encode()).encrypt(value.encode()).decode()


def open_seal(value: str) -> str:
    from cryptography.fernet import Fernet

    return Fernet(settings.connection_encryption_key.encode()).decrypt(value.encode()).decode()


def log_action(db: Session, user_id: int | None, action: str, resource: str):
    db.add(AuditLog(user_id=user_id, action=action, resource=resource))


@app.on_event("startup")
def ensure_admin():
    db = next(get_db())
    try:
        admin = db.scalar(select(User).where(User.username == settings.admin_username))
        if admin is None:
            db.add(User(username=settings.admin_username, password_hash=password_hash.hash(settings.admin_password), role="admin"))
            db.commit()
    finally:
        db.close()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/auth/login")
def login(form: Annotated[OAuth2PasswordRequestForm, Depends()], db: Annotated[Session, Depends(get_db)]):
    user = db.scalar(select(User).where(User.username == form.username))
    if not user or not user.is_active or not password_hash.verify(form.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect username or password", headers={"WWW-Authenticate": "Bearer"})
    log_action(db, user.id, "login", f"user:{user.username}")
    db.commit()
    return {"access_token": create_access_token(user), "token_type": "bearer"}


@app.get("/auth/me", response_model=UserResponse)
def me(user: Annotated[User, Depends(get_current_user)]):
    return user


@app.post("/auth/logout")
def logout(token: Annotated[str, Depends(oauth2_scheme)]):
    try:
        revoked_tokens.add(decode(token, settings.jwt_secret, algorithms=["HS256"])["jti"])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return {"status": "ok"}


@app.get("/auth/users", response_model=list[UserResponse])
def list_users(db: Annotated[Session, Depends(get_db)], _: Annotated[User, Depends(require_admin)]):
    return db.scalars(select(User).order_by(User.id)).all()


@app.post("/auth/users", response_model=UserResponse, status_code=201)
def create_user(body: UserCreate, db: Annotated[Session, Depends(get_db)], _: Annotated[User, Depends(require_admin)]):
    if db.scalar(select(User).where(User.username == body.username)):
        raise HTTPException(status_code=409, detail="Username already exists")
    user = User(username=body.username, password_hash=password_hash.hash(body.password), role=body.role)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Username already exists")
    db.refresh(user)
    return user


@app.patch("/auth/users/{user_id}", response_model=UserResponse)
def update_user(user_id: int, body: UserCreate, db: Annotated[Session, Depends(get_db)], _: Annotated[User, Depends(require_admin)]):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.username = body.username
    user.password_hash = password_hash.hash(body.password)
    user.role = body.role
    db.commit()
    db.refresh(user)
    return user


@app.delete("/auth/users/{user_id}", status_code=204)
def delete_user(user_id: int, db: Annotated[Session, Depends(get_db)], actor: Annotated[User, Depends(require_admin)]):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == actor.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    db.delete(user)
    db.commit()


@app.get("/connections", response_model=list[ConnectionResponse])
def list_connections(db: Annotated[Session, Depends(get_db)], _: Annotated[User, Depends(get_current_user)]):
    return db.scalars(select(DatabaseConnection).order_by(DatabaseConnection.id)).all()


@app.post("/connections", response_model=ConnectionResponse, status_code=201)
def create_connection(body: ConnectionCreate, db: Annotated[Session, Depends(get_db)], actor: Annotated[User, Depends(require_admin)]):
    from sqlalchemy.engine import make_url

    try:
        url = make_url(body.uri)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid PostgreSQL connection URI")
    if url.drivername not in ("postgresql", "postgresql+psycopg") or not url.host or not url.database:
        raise HTTPException(status_code=422, detail="Only PostgreSQL URIs with host and database are supported")
    try:
        encrypted_uri = seal(body.uri)
    except Exception:
        raise HTTPException(status_code=500, detail="Connection encryption is not configured correctly")
    connection = DatabaseConnection(name=body.name.strip(), db_type="postgresql", encrypted_uri=encrypted_uri, created_by=actor.id)
    if not connection.name:
        raise HTTPException(status_code=422, detail="Connection name cannot be empty")
    db.add(connection)
    db.commit()
    db.refresh(connection)
    log_action(db, actor.id, "create_connection", f"connection:{connection.id}")
    db.commit()
    return connection


@app.patch("/connections/{connection_id}", response_model=ConnectionResponse)
def update_connection(connection_id: int, body: ConnectionCreate, db: Annotated[Session, Depends(get_db)], _: Annotated[User, Depends(require_admin)]):
    connection = db.get(DatabaseConnection, connection_id)
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    from sqlalchemy.engine import make_url

    try:
        url = make_url(body.uri)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid PostgreSQL connection URI")
    if url.drivername not in ("postgresql", "postgresql+psycopg") or not url.host or not url.database:
        raise HTTPException(status_code=422, detail="Only PostgreSQL URIs with host and database are supported")
    connection.name = body.name.strip()
    if not connection.name:
        raise HTTPException(status_code=422, detail="Connection name cannot be empty")
    try:
        connection.encrypted_uri = seal(body.uri)
    except Exception:
        raise HTTPException(status_code=500, detail="Connection encryption is not configured correctly")
    connection.status = "unknown"
    db.commit()
    db.refresh(connection)
    return connection


@app.delete("/connections/{connection_id}", status_code=204)
def delete_connection(connection_id: int, db: Annotated[Session, Depends(get_db)], _: Annotated[User, Depends(require_admin)]):
    connection = db.get(DatabaseConnection, connection_id)
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    db.delete(connection)
    db.commit()


def get_connection(db: Session, connection_id: int) -> DatabaseConnection:
    connection = db.get(DatabaseConnection, connection_id)
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    return connection


def source_engine(connection: DatabaseConnection):
    from sqlalchemy import create_engine

    return create_engine(open_seal(connection.encrypted_uri), pool_pre_ping=True, connect_args={"connect_timeout": 10, "options": "-c statement_timeout=10000 -c default_transaction_read_only=on"}, echo=True)


@app.post("/connections/{connection_id}/test")
def test_connection(connection_id: int, db: Annotated[Session, Depends(get_db)], _: Annotated[User, Depends(require_admin)]):
    from sqlalchemy import text
    import traceback

    connection = get_connection(db, connection_id)
    try:
        uri = open_seal(connection.encrypted_uri)
        print(f"Testing connection: {uri.split('@')[1] if '@' in uri else 'hidden'}")
        engine = source_engine(connection)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        engine.dispose()
        connection.status = "connected"
        db.commit()
        return {"status": connection.status}
    except Exception as e:
        print(f"Connection test failed: {type(e).__name__}: {str(e)}")
        print(traceback.format_exc())
        connection.status = "error"
        db.commit()
        raise HTTPException(status_code=400, detail=f"Could not connect: {type(e).__name__}: {str(e)}")


@app.get("/connections/{connection_id}/schema")
def connection_schema(connection_id: int, db: Annotated[Session, Depends(get_db)], _: Annotated[User, Depends(require_admin)]):
    from sqlalchemy import inspect

    try:
        engine = source_engine(get_connection(db, connection_id))
        inspector = inspect(engine)
        result = [{"schema": schema, "table": table, "columns": [{"name": column["name"], "type": str(column["type"])} for column in inspector.get_columns(table, schema)]} for schema in inspector.get_schema_names() if schema not in ("information_schema", "pg_catalog", "alembic") for table in inspector.get_table_names(schema) if not table.startswith("pg_")]
        engine.dispose()
        return result
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read PostgreSQL schema")


@app.get("/connections/{connection_id}/sample")
def connection_sample(connection_id: int, schema: str, table: str, db: Annotated[Session, Depends(get_db)], _: Annotated[User, Depends(require_admin)]):
    from sqlalchemy import MetaData, Table, select

    if not schema.replace("_", "").isalnum() or not table.replace("_", "").isalnum() or schema.startswith("pg_") or schema == "information_schema" or table.startswith("pg_"):
        raise HTTPException(status_code=422, detail="Invalid schema or table name")
    try:
        engine = source_engine(get_connection(db, connection_id))
        metadata = MetaData()
        source_table = Table(table, metadata, schema=schema, autoload_with=engine)
        with engine.connect() as conn:
            rows = conn.execute(select(source_table).limit(100)).mappings().all()
        engine.dispose()
        return {"columns": list(source_table.columns.keys()), "rows": [dict(row) for row in rows]}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read source table")


def read_query(sql: str) -> str:
    try:
        statements = sqlglot.parse(sql, read="postgres")
    except sqlglot.errors.ParseError:
        raise HTTPException(status_code=422, detail="Invalid SQL syntax")
    if len(statements) != 1 or not isinstance(statements[0], exp.Select) or any(isinstance(node, (exp.Insert, exp.Update, exp.Delete, exp.Merge, exp.Command, exp.Copy, exp.Create, exp.Drop, exp.Into)) for node in statements[0].walk()):
        raise HTTPException(status_code=422, detail="Only a single read-only SELECT query is allowed")
    query = statements[0]
    if any((isinstance(node, exp.Func) and node.sql_name().upper() in {"PG_READ_FILE", "PG_READ_BINARY_FILE", "PG_LS_DIR", "PG_SLEEP", "DBLINK", "DBLINK_EXEC"}) or (isinstance(node, exp.Anonymous) and node.name.upper() in {"PG_READ_FILE", "PG_READ_BINARY_FILE", "PG_LS_DIR", "PG_SLEEP", "DBLINK", "DBLINK_EXEC"}) for node in query.walk()):
        raise HTTPException(status_code=422, detail="This PostgreSQL function is not allowed")
    return query.limit(1000).sql(dialect="postgres")


@app.post("/sql/execute")
def execute_sql(body: QueryRequest, db: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(get_current_user)]):
    from sqlalchemy import text

    query = read_query(body.sql)
    try:
        engine = source_engine(get_connection(db, body.connection_id))
        with engine.connect() as conn:
            result = conn.execute(text(query))
            columns = list(result.keys())
            rows = [dict(row) for row in result.mappings().fetchmany(1000)]
        engine.dispose()
        log_action(db, user.id, "execute_sql", f"connection:{body.connection_id}")
        db.commit()
        return {"columns": columns, "rows": rows, "limit": 1000}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Query failed on PostgreSQL source")


@app.get("/sql/queries", response_model=list[QueryResponse])
def list_queries(db: Annotated[Session, Depends(get_db)], _: Annotated[User, Depends(get_current_user)]):
    return db.scalars(select(SavedQuery).order_by(SavedQuery.id.desc())).all()


@app.post("/sql/queries", response_model=QueryResponse, status_code=201)
def save_query(body: QuerySave, db: Annotated[Session, Depends(get_db)], actor: Annotated[User, Depends(require_analyst)]):
    read_query(body.sql)
    query = SavedQuery(name=body.name.strip(), sql=body.sql, created_by=actor.id)
    if not query.name:
        raise HTTPException(status_code=422, detail="Query name cannot be empty")
    db.add(query)
    db.commit()
    db.refresh(query)
    log_action(db, actor.id, "save_query", f"query:{query.id}")
    db.commit()
    return query


def dataset_rows(db: Session, dataset: Dataset, limit: int = 1000):
    from sqlalchemy import MetaData, Table, select, text

    connection = get_connection(db, int(dataset.source_ref.split("\n", 1)[0]))
    engine = source_engine(connection)
    with engine.connect() as conn:
        if dataset.source_type == "table":
            schema, table_name = dataset.source_ref.split("\n", 1)[1].split(".", 1)
            table = Table(table_name, MetaData(), schema=schema, autoload_with=engine)
            result = list(table.columns.keys()), [dict(row) for row in conn.execute(select(table).limit(limit)).mappings().all()]
        else:
            result_obj = conn.execute(text(read_query(dataset.source_ref.split("\n", 1)[1])))
            result = list(result_obj.keys()), [dict(row) for row in result_obj.mappings().fetchmany(limit)]
    engine.dispose()
    return result


@app.get("/datasets", response_model=list[DatasetResponse])
def list_datasets(db: Annotated[Session, Depends(get_db)], _: Annotated[User, Depends(get_current_user)]):
    return db.scalars(select(Dataset).order_by(Dataset.id.desc())).all()


@app.post("/datasets", response_model=DatasetResponse, status_code=201)
def create_dataset(body: DatasetCreate, db: Annotated[Session, Depends(get_db)], actor: Annotated[User, Depends(require_analyst)]):
    connection = get_connection(db, body.connection_id)
    source_ref = body.source_ref.strip()
    if body.source_type == "table":
        if source_ref.count(".") != 1:
            raise HTTPException(status_code=422, detail="Use schema.table for a table dataset")
        schema, table = source_ref.split(".")
        if not schema.replace("_", "").isalnum() or not table.replace("_", "").isalnum() or schema.startswith("pg_") or schema == "information_schema" or table.startswith("pg_"):
            raise HTTPException(status_code=422, detail="Invalid schema or table")
        source_ref = f"{body.connection_id}\n{schema}.{table}"
    else:
        read_query(source_ref)
        source_ref = f"{body.connection_id}\n{source_ref}"
    dataset = Dataset(name=body.name.strip(), source_type=body.source_type, source_ref=source_ref, columns=[], column_metadata={}, created_by=actor.id)
    db.add(dataset)
    db.commit()
    db.refresh(dataset)
    try:
        columns, _ = dataset_rows(db, dataset, 1)
        dataset.columns = columns
        db.commit()
        db.refresh(dataset)
        log_action(db, actor.id, "create_dataset", f"dataset:{dataset.id}")
        db.commit()
        return dataset
    except Exception:
        db.delete(dataset)
        db.commit()
        raise HTTPException(status_code=400, detail="Could not inspect dataset source")


@app.get("/datasets/{dataset_id}/preview")
def preview_dataset(dataset_id: int, db: Annotated[Session, Depends(get_db)], _: Annotated[User, Depends(get_current_user)]):
    dataset = db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    columns, rows = dataset_rows(db, dataset)
    return {"columns": columns, "rows": rows, "limit": 1000}


@app.patch("/datasets/{dataset_id}", response_model=DatasetResponse)
def update_dataset(dataset_id: int, body: DatasetCreate, db: Annotated[Session, Depends(get_db)], _: Annotated[User, Depends(require_analyst)]):
    dataset = db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    get_connection(db, body.connection_id)
    source_ref = body.source_ref.strip()
    if body.source_type == "table":
        if source_ref.count(".") != 1:
            raise HTTPException(status_code=422, detail="Use schema.table for a table dataset")
        schema, table = source_ref.split(".")
        if not schema.replace("_", "").isalnum() or not table.replace("_", "").isalnum():
            raise HTTPException(status_code=422, detail="Invalid schema or table")
        source_ref = f"{body.connection_id}\n{schema}.{table}"
    else:
        read_query(source_ref)
        source_ref = f"{body.connection_id}\n{source_ref}"
    old = (dataset.name, dataset.source_type, dataset.source_ref, dataset.columns)
    dataset.name, dataset.source_type, dataset.source_ref, dataset.columns = body.name.strip(), body.source_type, source_ref, []
    try:
        columns, _ = dataset_rows(db, dataset, 1)
        dataset.columns = columns
        db.commit()
        db.refresh(dataset)
        return dataset
    except Exception:
        dataset.name, dataset.source_type, dataset.source_ref, dataset.columns = old
        db.rollback()
        raise HTTPException(status_code=400, detail="Could not inspect dataset source")


@app.patch("/datasets/{dataset_id}/metadata")
def update_dataset_metadata(dataset_id: int, body: DatasetMetadataUpdate, db: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(require_analyst)]):
    dataset = db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    metadata = dataset.column_metadata or {}
    for col, meta in body.columns.items():
        if col not in dataset.columns:
            raise HTTPException(status_code=422, detail=f"Column {col} does not exist in dataset")
        if col not in metadata:
            metadata[col] = {}
        metadata[col].update(meta)
    if "metrics" in body.metrics:
        metadata["__metrics__"] = body.metrics
    dataset.column_metadata = metadata
    db.commit()
    log_action(db, user.id, "update_dataset_metadata", f"dataset:{dataset_id}")
    db.commit()
    return {"status": "ok", "column_metadata": dataset.column_metadata}


@app.delete("/datasets/{dataset_id}", status_code=204)
def delete_dataset(dataset_id: int, db: Annotated[Session, Depends(get_db)], _: Annotated[User, Depends(require_analyst)]):
    dataset = db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    db.delete(dataset)
    db.commit()


@app.get("/charts", response_model=list[ChartResponse])
def list_charts(db: Annotated[Session, Depends(get_db)], _: Annotated[User, Depends(get_current_user)]):
    return db.scalars(select(Chart).order_by(Chart.id.desc())).all()


@app.post("/charts", response_model=ChartResponse, status_code=201)
def create_chart(body: ChartCreate, db: Annotated[Session, Depends(get_db)], actor: Annotated[User, Depends(require_analyst)]):
    dataset = db.get(Dataset, body.dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if body.config.get("type") not in ("bar", "line", "pie") or not body.config.get("dimension") or not body.config.get("measure"):
        raise HTTPException(status_code=422, detail="Chart requires a supported type, dimension and measure")
    if body.config["dimension"] not in dataset.columns or body.config["measure"] not in dataset.columns:
        raise HTTPException(status_code=422, detail="Chart fields must exist in the dataset")
    chart = Chart(name=body.name.strip(), dataset_id=body.dataset_id, config=body.config, created_by=actor.id)
    db.add(chart)
    db.commit()
    db.refresh(chart)
    return chart


@app.patch("/charts/{chart_id}", response_model=ChartResponse)
def update_chart(chart_id: int, body: ChartCreate, db: Annotated[Session, Depends(get_db)], _: Annotated[User, Depends(require_analyst)]):
    chart = db.get(Chart, chart_id)
    dataset = db.get(Dataset, body.dataset_id)
    if not chart or not dataset:
        raise HTTPException(status_code=404, detail="Chart or dataset not found")
    if body.config.get("type") not in ("bar", "line", "pie") or body.config.get("dimension") not in dataset.columns or body.config.get("measure") not in dataset.columns:
        raise HTTPException(status_code=422, detail="Chart fields or type are invalid")
    chart.name, chart.dataset_id, chart.config = body.name.strip(), body.dataset_id, body.config
    db.commit()
    db.refresh(chart)
    return chart


@app.get("/charts/{chart_id}/data")
def chart_data(chart_id: int, db: Annotated[Session, Depends(get_db)], _: Annotated[User, Depends(get_current_user)]):
    chart = db.get(Chart, chart_id)
    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")
    dataset = db.get(Dataset, chart.dataset_id)
    columns, rows = dataset_rows(db, dataset)
    dimension, measure = chart.config["dimension"], chart.config["measure"]
    aggregation = chart.config.get("aggregation", "sum")
    if dimension not in columns or measure not in columns:
        raise HTTPException(status_code=422, detail="Chart fields do not exist in dataset")

    # Get friendly names from metadata
    dimension_label = dataset.column_metadata.get(dimension, {}).get("friendly_name", dimension) if dataset.column_metadata else dimension
    measure_label = dataset.column_metadata.get(measure, {}).get("friendly_name", measure) if dataset.column_metadata else measure

    # Aggregate data by dimension
    aggregated: dict = {}
    counts: dict = {}

    for row in rows:
        dim_value = row[dimension]
        measure_value = row[measure]

        if dim_value not in aggregated:
            aggregated[dim_value] = []
            counts[dim_value] = 0

        if isinstance(measure_value, (int, float)):
            aggregated[dim_value].append(measure_value)
            counts[dim_value] += 1
        elif measure_value is not None and aggregation != "count":
            raise HTTPException(status_code=422, detail="Chart measure must contain numeric values")

    # Apply aggregation function
    result_data = []
    for key, values in aggregated.items():
        if aggregation == "sum":
            result_value = sum(values)
        elif aggregation == "avg":
            result_value = sum(values) / len(values) if values else 0
        elif aggregation == "count":
            result_value = counts[key]
        elif aggregation == "min":
            result_value = min(values) if values else 0
        elif aggregation == "max":
            result_value = max(values) if values else 0
        else:
            result_value = sum(values)

        result_data.append({"name": str(key), "value": round(result_value, 2)})

    # Add aggregation to label
    agg_labels = {"sum": "Tổng", "avg": "Trung bình", "count": "Số lượng", "min": "Min", "max": "Max"}
    measure_with_agg = f"{agg_labels.get(aggregation, aggregation)} {measure_label}"

    return {
        "data": result_data,
        "dimension_label": dimension_label,
        "measure_label": measure_with_agg
    }


@app.delete("/charts/{chart_id}", status_code=204)
def delete_chart(chart_id: int, db: Annotated[Session, Depends(get_db)], _: Annotated[User, Depends(require_analyst)]):
    chart = db.get(Chart, chart_id)
    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")
    db.delete(chart)
    db.commit()


@app.get("/dashboards", response_model=list[DashboardResponse])
def list_dashboards(db: Annotated[Session, Depends(get_db)], _: Annotated[User, Depends(get_current_user)], search: str | None = None, tag: str | None = None):
    query = select(Dashboard).order_by(Dashboard.updated_at.desc())
    if search:
        query = query.where(Dashboard.name.ilike(f"%{search}%"))
    if tag:
        query = query.where(Dashboard.tags.contains([tag]))
    dashboards = db.scalars(query).all()
    result = []
    for item in dashboards:
        owner = db.get(User, item.owner_id) if item.owner_id else None
        charts_data = [{"chart_id": link.chart_id, "position": link.position} for link in db.scalars(select(DashboardChart).where(DashboardChart.dashboard_id == item.id)).all()]
        result.append({
            "id": item.id,
            "name": item.name,
            "description": item.description,
            "tags": item.tags or [],
            "owner_id": item.owner_id,
            "owner_username": owner.username if owner else None,
            "charts": charts_data,
            "share_token": item.share_token,
            "created_at": item.created_at.isoformat(),
            "updated_at": item.updated_at.isoformat()
        })
    return result


@app.post("/dashboards", response_model=DashboardResponse, status_code=201)
def create_dashboard(body: DashboardCreate, db: Annotated[Session, Depends(get_db)], actor: Annotated[User, Depends(require_analyst)]):
    dashboard = Dashboard(name=body.name.strip(), description=body.description, tags=body.tags or [], owner_id=actor.id)
    db.add(dashboard)
    db.commit()
    db.refresh(dashboard)
    log_action(db, actor.id, "create_dashboard", f"dashboard:{dashboard.id}")
    db.commit()
    return {
        "id": dashboard.id,
        "name": dashboard.name,
        "description": dashboard.description,
        "tags": dashboard.tags or [],
        "owner_id": dashboard.owner_id,
        "owner_username": actor.username,
        "charts": [],
        "share_token": None,
        "created_at": dashboard.created_at.isoformat(),
        "updated_at": dashboard.updated_at.isoformat()
    }


@app.patch("/dashboards/{dashboard_id}", response_model=DashboardResponse)
def update_dashboard(dashboard_id: int, body: DashboardCreate, db: Annotated[Session, Depends(get_db)], _: Annotated[User, Depends(require_analyst)]):
    dashboard = db.get(Dashboard, dashboard_id)
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    dashboard.name = body.name.strip()
    dashboard.description = body.description
    dashboard.tags = body.tags or []
    db.commit()
    db.refresh(dashboard)
    owner = db.get(User, dashboard.owner_id) if dashboard.owner_id else None
    links = db.scalars(select(DashboardChart).where(DashboardChart.dashboard_id == dashboard_id)).all()
    return {
        "id": dashboard.id,
        "name": dashboard.name,
        "description": dashboard.description,
        "tags": dashboard.tags or [],
        "owner_id": dashboard.owner_id,
        "owner_username": owner.username if owner else None,
        "charts": [{"chart_id": item.chart_id, "position": item.position} for item in links],
        "share_token": dashboard.share_token,
        "created_at": dashboard.created_at.isoformat(),
        "updated_at": dashboard.updated_at.isoformat()
    }


@app.post("/dashboards/{dashboard_id}/share")
def share_dashboard(dashboard_id: int, db: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(require_analyst)], body: DashboardShareRequest | None = None):
    from secrets import token_urlsafe
    from app.auth import password_hash
    dashboard = db.get(Dashboard, dashboard_id)
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    if not dashboard.share_token:
        dashboard.share_token = token_urlsafe(32)
    if body and body.password:
        dashboard.share_password = password_hash.hash(body.password)
    else:
        dashboard.share_password = None
    db.commit()
    log_action(db, user.id, "share_dashboard", f"dashboard:{dashboard_id}")
    db.commit()
    return {"share_token": dashboard.share_token, "share_url": f"/embed/{dashboard.share_token}", "password_protected": bool(body and body.password)}


@app.get("/embed/{share_token}")
def embed_dashboard(share_token: str, db: Annotated[Session, Depends(get_db)], password: str | None = None):
    from app.auth import password_hash
    dashboard = db.scalar(select(Dashboard).where(Dashboard.share_token == share_token))
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found or not shared")
    if dashboard.share_password:
        if not password or not password_hash.verify(password, dashboard.share_password):
            raise HTTPException(status_code=401, detail="Password required or incorrect")
    links = db.scalars(select(DashboardChart).where(DashboardChart.dashboard_id == dashboard.id)).all()
    chart_ids = [link.chart_id for link in links]
    charts = [db.get(Chart, cid) for cid in chart_ids]
    return {"dashboard": {"id": dashboard.id, "name": dashboard.name, "description": dashboard.description}, "charts": [{"id": c.id, "name": c.name, "dataset_id": c.dataset_id, "config": c.config, "position": next((link.position for link in links if link.chart_id == c.id), {})} for c in charts if c]}


@app.get("/embed/{share_token}/chart/{chart_id}/data")
def embed_chart_data(share_token: str, chart_id: int, db: Annotated[Session, Depends(get_db)], password: str | None = None):
    from app.auth import password_hash
    dashboard = db.scalar(select(Dashboard).where(Dashboard.share_token == share_token))
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not shared")
    if dashboard.share_password:
        if not password or not password_hash.verify(password, dashboard.share_password):
            raise HTTPException(status_code=401, detail="Password required or incorrect")
    link = db.get(DashboardChart, (dashboard.id, chart_id))
    if not link:
        raise HTTPException(status_code=404, detail="Chart not in this dashboard")
    chart = db.get(Chart, chart_id)
    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")
    dataset = db.get(Dataset, chart.dataset_id)
    columns, rows = dataset_rows(db, dataset)
    dimension, measure = chart.config["dimension"], chart.config["measure"]
    aggregation = chart.config.get("aggregation", "sum")

    # Get friendly names from metadata
    dimension_label = dataset.column_metadata.get(dimension, {}).get("friendly_name", dimension) if dataset.column_metadata else dimension
    measure_label = dataset.column_metadata.get(measure, {}).get("friendly_name", measure) if dataset.column_metadata else measure

    # Aggregate data
    aggregated: dict = {}
    counts: dict = {}

    for row in rows:
        dim_value = row[dimension]
        measure_value = row[measure]

        if dim_value not in aggregated:
            aggregated[dim_value] = []
            counts[dim_value] = 0

        if isinstance(measure_value, (int, float)):
            aggregated[dim_value].append(measure_value)
            counts[dim_value] += 1

    result_data = []
    for key, values in aggregated.items():
        if aggregation == "sum":
            result_value = sum(values)
        elif aggregation == "avg":
            result_value = sum(values) / len(values) if values else 0
        elif aggregation == "count":
            result_value = counts[key]
        elif aggregation == "min":
            result_value = min(values) if values else 0
        elif aggregation == "max":
            result_value = max(values) if values else 0
        else:
            result_value = sum(values)

        result_data.append({"name": str(key), "value": round(result_value, 2)})

    agg_labels = {"sum": "Tổng", "avg": "Trung bình", "count": "Số lượng", "min": "Min", "max": "Max"}
    measure_with_agg = f"{agg_labels.get(aggregation, aggregation)} {measure_label}"

    return {
        "data": result_data,
        "dimension_label": dimension_label,
        "measure_label": measure_with_agg
    }


@app.post("/dashboards/{dashboard_id}/charts", response_model=DashboardResponse)
def add_dashboard_chart(dashboard_id: int, body: DashboardChartAdd, db: Annotated[Session, Depends(get_db)], actor: Annotated[User, Depends(require_analyst)]):
    dashboard, chart = db.get(Dashboard, dashboard_id), db.get(Chart, body.chart_id)
    if not dashboard or not chart:
        raise HTTPException(status_code=404, detail="Dashboard or chart not found")
    link = db.get(DashboardChart, (dashboard_id, body.chart_id))
    if link:
        link.position = body.position
    else:
        db.add(DashboardChart(dashboard_id=dashboard_id, chart_id=body.chart_id, position=body.position))
    db.commit()
    db.refresh(dashboard)
    owner = db.get(User, dashboard.owner_id) if dashboard.owner_id else None
    links = db.scalars(select(DashboardChart).where(DashboardChart.dashboard_id == dashboard_id)).all()
    return {
        "id": dashboard.id,
        "name": dashboard.name,
        "description": dashboard.description,
        "tags": dashboard.tags or [],
        "owner_id": dashboard.owner_id,
        "owner_username": owner.username if owner else None,
        "charts": [{"chart_id": item.chart_id, "position": item.position} for item in links],
        "share_token": dashboard.share_token,
        "created_at": dashboard.created_at.isoformat(),
        "updated_at": dashboard.updated_at.isoformat()
    }


@app.delete("/dashboards/{dashboard_id}/charts/{chart_id}", status_code=204)
def remove_dashboard_chart(dashboard_id: int, chart_id: int, db: Annotated[Session, Depends(get_db)], _: Annotated[User, Depends(require_analyst)]):
    link = db.get(DashboardChart, (dashboard_id, chart_id))
    if not link:
        raise HTTPException(status_code=404, detail="Dashboard chart not found")
    db.delete(link)
    db.commit()


@app.delete("/dashboards/{dashboard_id}", status_code=204)
def delete_dashboard(dashboard_id: int, db: Annotated[Session, Depends(get_db)], _: Annotated[User, Depends(require_analyst)]):
    dashboard = db.get(Dashboard, dashboard_id)
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    db.delete(dashboard)
    db.commit()


@app.get("/audit/logs")
def list_audit_logs(db: Annotated[Session, Depends(get_db)], _: Annotated[User, Depends(require_admin)], limit: int = 100, offset: int = 0):
    logs = db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(min(limit, 500)).offset(offset)).all()
    return [{"id": log.id, "user_id": log.user_id, "action": log.action, "resource": log.resource, "created_at": log.created_at.isoformat()} for log in logs]
