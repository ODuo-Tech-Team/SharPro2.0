-- ============================================================================
-- SharkPro V2 - Migration 003: Knowledge Base (RAG), Enhanced Leads, AI Config
-- ============================================================================

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- 2. Knowledge Base tables
-- ============================================================================

-- Knowledge files (uploaded PDFs/docs)
CREATE TABLE IF NOT EXISTS knowledge_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_size INTEGER DEFAULT 0,
  mime_type TEXT DEFAULT 'application/pdf',
  status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'error')),
  chunk_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kf_org ON knowledge_files(organization_id);

-- Knowledge vectors (chunks with embeddings)
CREATE TABLE IF NOT EXISTS knowledge_vectors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES knowledge_files(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(1536),
  chunk_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kv_org ON knowledge_vectors(organization_id);
CREATE INDEX IF NOT EXISTS idx_kv_file ON knowledge_vectors(file_id);
CREATE INDEX IF NOT EXISTS idx_kv_embedding ON knowledge_vectors USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================================
-- 3. Vector similarity search function
-- ============================================================================

CREATE OR REPLACE FUNCTION match_knowledge_vectors(
  query_embedding vector(1536),
  filter_org_id UUID,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kv.id,
    kv.content,
    1 - (kv.embedding <=> query_embedding) AS similarity
  FROM knowledge_vectors kv
  WHERE kv.organization_id = filter_org_id
  ORDER BY kv.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- 4. Enhanced Leads columns
-- ============================================================================

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interest_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS origin TEXT DEFAULT 'organic';

-- ============================================================================
-- 5. AI Config on organizations
-- ============================================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS ai_config JSONB DEFAULT '{}';

-- ============================================================================
-- 6. RLS Policies
-- ============================================================================

ALTER TABLE knowledge_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_vectors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_knowledge_files" ON knowledge_files
  FOR ALL USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "org_knowledge_vectors" ON knowledge_vectors
  FOR ALL USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));
