"""Remove obsolete user-facing demo storage."""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_table("demo_entities")


def downgrade():
    # Schema rollback cannot restore removed demonstration data.
    op.create_table(
        "demo_entities",
        sa.Column("key", sa.String(80), primary_key=True),
        sa.Column("payload", sa.JSON(), nullable=False),
    )
