import asyncio
import os
from openai import OpenAI
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# Initialize Supabase
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(url, key)

# Initialize OpenAI for embeddings
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

SAMPLE_PROPERTIES = [
    {
        "title": "Ultra-Luxury Penthouse with Marina View",
        "description": "Exquisite 4-bedroom penthouse in Porto Arabia, The Pearl-Qatar. Features floor-to-ceiling windows, private pool on the terrace, and smart home automation. Fully furnished with high-end Italian furniture.",
        "location": "Porto Arabia, The Pearl-Qatar",
        "area": "The Pearl",
        "price": 45000,
        "type": "Apartment",
        "bedrooms": 4,
        "bathrooms": 5,
        "amenities": ["Private Pool", "Marina View", "Smart Home", "Gym", "Concierge"]
    },
    {
        "title": "Modern Villa in Fox Hills",
        "description": "Brand new 5-bedroom villa in Fox Hills, Lusail. Contemporary architecture, private garden, and walking distance to the park. Ideal for families looking for a sustainable community.",
        "location": "Fox Hills, Lusail City",
        "area": "Lusail",
        "price": 25000,
        "type": "Villa",
        "bedrooms": 5,
        "bathrooms": 6,
        "amenities": ["Garden", "Parking", "Sustainability Features", "Close to Park"]
    },
    {
        "title": "Beachfront Townhouse in Viva Bahriya",
        "description": "Charming 3-bedroom townhouse with direct beach access. Enjoy the serenity of Viva Bahriya with modern amenities and a safe environment for kids.",
        "location": "Viva Bahriya, The Pearl-Qatar",
        "area": "The Pearl",
        "price": 18000,
        "type": "Townhouse",
        "bedrooms": 3,
        "bathrooms": 4,
        "amenities": ["Beach Access", "Pool", "24/7 Security", "Kids Play Area"]
    },
    {
        "title": "High-Rise Executive Suite in West Bay",
        "description": "Professional 2-bedroom apartment in the heart of West Bay. Stunning skyline views, fully equipped kitchen, and proximity to major business hubs and shopping malls.",
        "location": "West Bay, Doha",
        "area": "West Bay",
        "price": 12000,
        "type": "Apartment",
        "bedrooms": 2,
        "bathrooms": 2,
        "amenities": ["Skyline View", "Business Center", "Pool", "Gym"]
    },
    {
        "title": "Waterfront Villa in Qetaifan Island North",
        "description": "Exclusive 6-bedroom waterfront villa with private jetty. The ultimate in Qatari luxury, featuring a private cinema, infinity pool, and expansive living areas.",
        "location": "Qetaifan Island North, Lusail",
        "area": "Lusail",
        "price": 85000,
        "type": "Villa",
        "bedrooms": 6,
        "bathrooms": 8,
        "amenities": ["Waterfront", "Private Jetty", "Infinity Pool", "Private Cinema"]
    }
]

async def get_embedding(text):
    response = openai_client.embeddings.create(
        input=text,
        model="text-embedding-3-small"
    )
    return response.data[0].embedding

async def seed_properties():
    print(f"Starting to seed {len(SAMPLE_PROPERTIES)} properties...")
    
    for prop in SAMPLE_PROPERTIES:
        # Combine title and description for embedding
        text_to_embed = f"{prop['title']} {prop['description']} {prop['location']} {prop['type']}"
        embedding = await get_embedding(text_to_embed)
        
        data = {
            **prop,
            "embedding": embedding
        }
        
        try:
            result = supabase.table("properties").insert(data).execute()
            print(f"✅ Inserted: {prop['title']}")
        except Exception as e:
            print(f"❌ Failed to insert {prop['title']}: {e}")

if __name__ == "__main__":
    asyncio.run(seed_properties())
