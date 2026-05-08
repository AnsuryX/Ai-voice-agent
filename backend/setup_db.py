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

    # SQL to create tables
    # Note: Since I can't run raw SQL via the client easily without the service role, 
    # I will provide the SQL for the user to run in their Supabase SQL Editor.
    
    sql_script = """
    -- Create Leads table
    CREATE TABLE IF NOT EXISTS leads (
        id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        sender_id TEXT UNIQUE NOT NULL,
        name TEXT,
        intent TEXT,
        area TEXT,
        status TEXT DEFAULT 'New',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- Create Chat History table
    CREATE TABLE IF NOT EXISTS chat_history (
        id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        sender_id TEXT NOT NULL,
        message TEXT NOT NULL,
        role TEXT NOT NULL, -- 'user' or 'assistant'
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    """
    
    print("\n--- ACTION REQUIRED ---")
    print("Please copy and paste the following SQL into your Supabase SQL Editor:")
    print(sql_script)
    print("-----------------------\n")

if __name__ == "__main__":
    setup_database()
