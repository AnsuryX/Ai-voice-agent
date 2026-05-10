from typing import Dict

class LeadQualifier:
    """Scores and qualifies leads based on engagement and intent"""
    
    def __init__(self):
        self.intent_scores = {
            "buy": 90,
            "buying": 90,
            "purchase": 85,
            "renting": 60,
            "rent": 60,
            "selling": 50,
            "sell": 50,
            "interested": 40,
            "curious": 20,
            "just browsing": 10,
        }
        
        self.urgency_scores = {
            "immediate": 100,
            "this week": 85,
            "this month": 70,
            "3-6 months": 50,
            "flexible": 20,
        }

    def calculate_score(self, lead_data: Dict, chat_history: list) -> int:
        """
        Calculate lead qualification score (0-100)
        
        Factors:
        - Intent clarity (30%)
        - Budget mentioned (20%)
        - Timeline urgency (20%)
        - Area preferences (15%)
        - Engagement level (15%)
        """
        score = 0
        
        # 1. Intent Score (0-30)
        intent = (lead_data.get("intent") or "").lower()
        intent_base = self.intent_scores.get(intent, 0)
        score += min(30, (intent_base / 90) * 30) if intent_base > 0 else 0
        
        # 2. Budget Score (0-20)
        budget = (lead_data.get("budget") or "").lower()
        if budget:
            has_high_budget = any(word in budget for word in 
                                 ["million", "500k", "1m", "premium", "luxury"])
            score += 20 if has_high_budget else 10
        
        # 3. Timeline/Urgency Score (0-20)
        context = lead_data.get("flow_context") or {}
        timeline = (context.get("timeline") or "").lower()
        timeline_base = self.urgency_scores.get(timeline, 0)
        score += (timeline_base / 100) * 20 if timeline_base > 0 else 5
        
        # 4. Area Preferences Score (0-15)
        area = (lead_data.get("area") or "").lower()
        if area:
            premium_areas = ["pearl", "lusail", "fox hills", "west bay", "msheireb"]
            has_area_pref = any(a in area for a in premium_areas)
            score += 15 if has_area_pref else 8
        
        # 5. Engagement Score (0-15)
        engagement = self._calculate_engagement(chat_history)
        score += engagement * 15 / 100
        
        # Status bonus
        status = (lead_data.get("status") or "").lower()
        if status == "booking requested":
            score += 10  # Already interested in booking
        
        return min(100, int(score))

    def _calculate_engagement(self, chat_history: list) -> float:
        """
        Calculate engagement level (0-100) based on:
        - Message frequency
        - Message length
        - Quick responses
        - Question count
        """
        if not chat_history or len(chat_history) < 2:
            return 20
        
        user_messages = [m for m in chat_history if m.get("role") == "user"]
        
        if not user_messages:
            return 0
        
        # Engagement based on message count
        engagement = min(50, len(user_messages) * 5)
        
        # Bonus for longer, more detailed messages
        avg_length = sum(len(m.get("message") or "") for m in user_messages) / len(user_messages)
        if avg_length > 50:
            engagement += 30
        elif avg_length > 20:
            engagement += 15
        
        # Bonus for questions (shows active engagement)
        question_count = sum(1 for m in user_messages if "?" in (m.get("message") or ""))
        engagement += min(20, question_count * 5)
        
        return min(100, engagement)

    def get_qualification_level(self, score: int) -> str:
        """Classify lead based on score"""
        if score >= 75:
            return "hot"
        elif score >= 50:
            return "qualified"
        elif score >= 30:
            return "developing"
        else:
            return "cold"

    def get_recommended_action(self, score: int, sentiment: str) -> str:
        """Recommend action based on qualification"""
        if score >= 75:
            if sentiment in ['angry', 'frustrated']:
                return "escalate_human"
            return "push_to_booking"
        elif score >= 50:
            return "guide_to_booking"
        elif score >= 30:
            return "nurture"
        else:
            return "educate"
