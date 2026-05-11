import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('backend/.env')

def setup_database():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    
    if not url or not key:
        print("Error: Supabase credentials missing.")
        return

    supabase = create_client(url, key)

    print(f"Connecting to Supabase at {url}...")

    sql_script = """
    -- Enable pgcrypto for UUID generation
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    -- Enable vector extension
    CREATE EXTENSION IF NOT EXISTS vector;

    -- Create Leads table
    CREATE TABLE IF NOT EXISTS leads (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        sender_id TEXT UNIQUE NOT NULL,
        name TEXT,
        intent TEXT,
        area TEXT,
        status TEXT DEFAULT 'New',
        ai_enabled BOOLEAN DEFAULT true,
        health_score FLOAT DEFAULT 1.0,
        total_cost FLOAT DEFAULT 0.0,
        flow_state TEXT,
        flow_context JSONB DEFAULT '{}'::jsonb,
        preferences TEXT,
        language_preference TEXT,
        last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        failed_intents_count INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- Create Chat History table
    CREATE TABLE IF NOT EXISTS chat_history (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        sender_id TEXT NOT NULL,
        message TEXT,
        role TEXT NOT NULL, -- 'user', 'assistant', or 'system'
        media_url TEXT,
        media_type TEXT, -- 'image', 'video', 'audio', 'document', 'text'
        latency FLOAT,
        cost FLOAT,
        sentiment FLOAT,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- Create Flows table
    CREATE TABLE IF NOT EXISTS flows (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        name TEXT NOT NULL,
        nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- Create settings table
    CREATE TABLE IF NOT EXISTS settings (
        id TEXT PRIMARY KEY DEFAULT 'default',
        provider TEXT NOT NULL DEFAULT 'groq',
        model TEXT NOT NULL DEFAULT 'llama-3.3-70b-versatile',
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- Create properties table
    CREATE TABLE IF NOT EXISTS properties (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        title TEXT NOT NULL,
        area TEXT,
        price NUMERIC,
        description TEXT,
        bedrooms INTEGER,
        type TEXT,
        images TEXT[],
        embedding VECTOR(1536),
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- Create system_logs table
    CREATE TABLE IF NOT EXISTS system_logs (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- match_properties function
    CREATE OR REPLACE FUNCTION match_properties (
      query_embedding VECTOR(1536),
      match_threshold FLOAT,
      match_count INT
    )
    RETURNS TABLE (
      id UUID,
      title TEXT,
      area TEXT,
      price NUMERIC,
      description TEXT,
      bedrooms INTEGER,
      type TEXT,
      images TEXT[],
      similarity FLOAT
    )
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RETURN QUERY
      SELECT
        properties.id,
        properties.title,
        properties.area,
        properties.price,
        properties.description,
        properties.bedrooms,
        properties.type,
        properties.images,
        1 - (properties.embedding <=> query_embedding) AS similarity
      FROM properties
      WHERE 1 - (properties.embedding <=> query_embedding) > match_threshold
      ORDER BY similarity DESC
      LIMIT match_count;
    END;
    $$;

    INSERT INTO settings (id, provider, model)
    VALUES ('default', 'groq', 'llama-3.3-70b-versatile')
    ON CONFLICT (id) DO NOTHING;
    """
    
    print("\n--- ACTION REQUIRED ---")
    print("Please copy and paste the following SQL into your Supabase SQL Editor:")
    print(sql_script)
    print("-----------------------\n")

if __name__ == "__main__":
    setup_database()
