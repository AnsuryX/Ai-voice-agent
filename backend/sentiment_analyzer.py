import re
from typing import Tuple

class SentimentAnalyzer:
    """Analyzes user sentiment to detect distressed/qualified leads"""
    
    def __init__(self):
        # Keywords indicating frustration/anger
        self.negative_keywords = [
            "frustrated", "angry", "annoyed", "never", "waste of time",
            "useless", "bad", "terrible", "hate", "don't care", "whatever",
            "fed up", "sick of", "disgusted", "disappointed", "wrong",
            "mistake", "scam", "fraud", "broken", "not working",
            "لا أريد", "غاضب", "محبط", "ما في", "تمام التمام"
        ]
        
        # Keywords indicating positive sentiment
        self.positive_keywords = [
            "great", "excellent", "love", "perfect", "amazing", "wonderful",
            "beautiful", "fantastic", "impressed", "thank you", "thanks",
            "happy", "excited", "interested", "definitely", "yes",
            "رائع", "ممتاز", "أحب", "جميل", "شكراً", "نعم", "أنا مهتم"
        ]
        
        # Urgency indicators
        self.urgency_keywords = [
            "urgent", "asap", "today", "now", "immediately", "quickly",
            "soon", "this week", "this month", "before", "deadline",
            "عاجل", "اليوم", "الآن", "بسرعة", "قريباً", "هذا الأسبوع"
        ]
        
        # Distress indicators (need human help)
        self.distress_keywords = [
            "help", "confused", "don't understand", "complicated",
            "lost", "stuck", "can't figure out", "not sure",
            "ساعد", "محتار", "ما فهمت", "صعب", "معقد"
        ]

    def analyze(self, message: str) -> Tuple[float, str, bool]:
        """
        Analyze sentiment of user message
        
        Returns:
            Tuple of (sentiment_score, sentiment_type, needs_human)
            - sentiment_score: -1.0 (angry) to 1.0 (happy)
            - sentiment_type: 'angry', 'frustrated', 'neutral', 'positive', 'very_positive'
            - needs_human: True if distressed/needs help
        """
        if not message:
            return 0.0, 'neutral', False
        
        message_lower = message.lower()
        
        # Check for distress
        needs_human = any(kw in message_lower for kw in self.distress_keywords)
        
        # Count sentiment indicators
        negative_count = sum(1 for kw in self.negative_keywords if kw in message_lower)
        positive_count = sum(1 for kw in self.positive_keywords if kw in message_lower)
        urgency_count = sum(1 for kw in self.urgency_keywords if kw in message_lower)
        
        # Determine sentiment
        if negative_count > positive_count:
            if negative_count >= 3:
                sentiment_type = 'angry'
                sentiment_score = -1.0
                needs_human = True  # Angry customers need human
            else:
                sentiment_type = 'frustrated'
                sentiment_score = -0.5
                needs_human = needs_human or (negative_count >= 2)
        elif positive_count > 0:
            if positive_count >= 3:
                sentiment_type = 'very_positive'
                sentiment_score = 1.0
            else:
                sentiment_type = 'positive'
                sentiment_score = 0.5
        else:
            sentiment_type = 'neutral'
            sentiment_score = 0.0
        
        return sentiment_score, sentiment_type, needs_human or urgency_count > 0

    def should_escalate_to_human(self, sentiment: str, distressed: bool, qualification_score: int) -> bool:
        """Determine if conversation should be escalated to human agent"""
        if distressed or sentiment in ['angry', 'frustrated']:
            return True
        if qualification_score >= 75:
            return True
        return False

    def get_sentiment_context(self, sentiment: str, qualification_score: int) -> str:
        """Get context string for AI to adjust tone"""
        if sentiment == 'angry':
            return "CONTEXT: Customer is angry. Be apologetic and offer immediate human support."
        elif sentiment == 'frustrated':
            return "CONTEXT: Customer is frustrated. Acknowledge frustration and provide quick solutions."
        elif sentiment == 'very_positive':
            return "CONTEXT: Customer is very happy. Maintain enthusiasm and guide toward booking."
        elif qualification_score >= 75:
            return "CONTEXT: This is a hot lead (highly qualified). Be proactive about scheduling."
        else:
            return "CONTEXT: Maintain professional, helpful tone. Ask clarifying questions."
