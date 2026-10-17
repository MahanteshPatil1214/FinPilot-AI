"""chat conversations and messages

Revision ID: b1a2c3d4e5f6
Revises: f88e96d08ac9
Create Date: 2026-10-17 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b1a2c3d4e5f6'
down_revision: Union[str, None] = 'f88e96d08ac9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('chat_conversations',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('organization_id', sa.String(length=36), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_chat_conversations_organization_id'), 'chat_conversations', ['organization_id'], unique=False)
    op.create_index('ix_chat_conversations_org_updated', 'chat_conversations', ['organization_id', 'updated_at'], unique=False)
    op.create_table('chat_messages',
    sa.Column('ordinal', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('conversation_id', sa.String(length=36), nullable=False),
    sa.Column('organization_id', sa.String(length=36), nullable=False),
    sa.Column('role', sa.String(length=20), nullable=False),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('payload_json', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.ForeignKeyConstraint(['conversation_id'], ['chat_conversations.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('ordinal')
    )
    op.create_index(op.f('ix_chat_messages_id'), 'chat_messages', ['id'], unique=True)
    op.create_index(op.f('ix_chat_messages_conversation_id'), 'chat_messages', ['conversation_id'], unique=False)
    op.create_index(op.f('ix_chat_messages_organization_id'), 'chat_messages', ['organization_id'], unique=False)
    op.create_index('ix_chat_messages_org_conversation', 'chat_messages', ['organization_id', 'conversation_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_chat_messages_org_conversation', table_name='chat_messages')
    op.drop_index(op.f('ix_chat_messages_organization_id'), table_name='chat_messages')
    op.drop_index(op.f('ix_chat_messages_conversation_id'), table_name='chat_messages')
    op.drop_index(op.f('ix_chat_messages_id'), table_name='chat_messages')
    op.drop_table('chat_messages')
    op.drop_index('ix_chat_conversations_org_updated', table_name='chat_conversations')
    op.drop_index(op.f('ix_chat_conversations_organization_id'), table_name='chat_conversations')
    op.drop_table('chat_conversations')
