-- Migration 011: Persistent support interaction logging
--
-- Captures every AI-user exchange and escalation outcome.
-- Replaces the in-memory support log.

CREATE TABLE IF NOT EXISTS support_interactions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             text        NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),

  -- Conversation content (capped at application layer to limit storage)
  user_message        text        NOT NULL,
  ai_response         text        NOT NULL,

  -- Classification
  category            text,
  confidence          text,

  -- Escalation
  escalated           boolean     NOT NULL DEFAULT false,
  escalation_outcome  text,       -- 'email_sent', 'email_failed', 'rate_limited', null

  -- How the response was generated
  response_source     text        NOT NULL
                      CHECK (response_source IN (
                        'billing_policy', 'kb', 'ai', 'fallback', 'escalation'
                      ))
);

CREATE INDEX IF NOT EXISTS idx_support_interactions_user
  ON support_interactions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_interactions_escalated
  ON support_interactions (escalated) WHERE escalated = true;
