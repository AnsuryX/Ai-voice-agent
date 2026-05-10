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
    """
    
    print("\n--- ACTION REQUIRED ---")
    print("Please copy and paste the following SQL into your Supabase SQL Editor:")
    print(sql_script)
    print("-----------------------\n")

if __name__ == "__main__":
    setup_database()
