"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiClient = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Load .env from root or local backend
const rootEnv = path_1.default.resolve(__dirname, '../../../.env');
if (fs_1.default.existsSync(rootEnv)) {
    dotenv_1.default.config({ path: rootEnv });
}
else {
    dotenv_1.default.config();
}
const AI_SERVICE_URL = (process.env.AI_SERVICE_URL || 'http://localhost:8000').replace(/\/+$/, '');
exports.aiClient = {
    /**
     * Classify ticket into tags and urgency
     */
    async classifyTicket(ticketText) {
        try {
            const response = await fetch(`${AI_SERVICE_URL}/tag`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticket_text: ticketText }),
            });
            if (!response.ok) {
                throw new Error(`AI service /tag responded with status ${response.status}`);
            }
            const data = await response.json();
            return {
                tags: Array.isArray(data.tags) && data.tags.length > 0 ? data.tags : ['other'],
                urgency: data.urgency || 'medium',
            };
        }
        catch (err) {
            console.warn('[aiClient] /tag failed, falling back to default tags:', err);
            return {
                tags: ['other'],
                urgency: 'medium',
            };
        }
    },
    /**
     * Run RAG question answering with confidence calculation
     */
    async getAnswer(ticketText) {
        try {
            const response = await fetch(`${AI_SERVICE_URL}/answer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticket_text: ticketText }),
            });
            if (!response.ok) {
                throw new Error(`AI service /answer responded with status ${response.status}`);
            }
            const data = await response.json();
            return {
                answer: data.answer || '',
                confidence: typeof data.confidence === 'number' ? data.confidence : 0,
                sources: Array.isArray(data.sources) ? data.sources : [],
                needs_human: Boolean(data.needs_human),
            };
        }
        catch (err) {
            console.warn('[aiClient] /answer failed or service down. Marking for human escalation:', err);
            return {
                answer: '',
                confidence: 0,
                sources: [],
                needs_human: true,
            };
        }
    },
    /**
     * Generate 3-line briefing summary for human agent
     */
    async getSummary(ticketText, attemptedAnswer) {
        try {
            const response = await fetch(`${AI_SERVICE_URL}/summarize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ticket_text: ticketText,
                    attempted_answer: attemptedAnswer || '',
                }),
            });
            if (!response.ok) {
                throw new Error(`AI service /summarize responded with status ${response.status}`);
            }
            const data = await response.json();
            return data.summary || '';
        }
        catch (err) {
            console.warn('[aiClient] /summarize failed, generating local fallback summary:', err);
            const snippet = ticketText.replace(/\s+/g, ' ').slice(0, 80);
            return `1. Customer Wants: Help with: "${snippet}..."\n2. AI Attempted: System offline or insufficient confidence to answer automatically.\n3. Suggested Next Step: Review customer request and reply directly.`;
        }
    },
    /**
     * Trigger knowledge base re-ingestion in Python service
     */
    async reingestKb() {
        const response = await fetch(`${AI_SERVICE_URL}/ingest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) {
            throw new Error(`AI service /ingest failed with status ${response.status}`);
        }
        return await response.json();
    },
    /**
     * Generate analytical insight text for weekly report
     */
    async getInsights(metrics) {
        try {
            const response = await fetch(`${AI_SERVICE_URL}/insights`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(metrics),
            });
            if (response.ok) {
                const data = await response.json();
                if (data.insight)
                    return data.insight;
            }
        }
        catch (err) {
            console.warn('[aiClient] /insights failed, using analytical fallback:', err);
        }
        const topTag = metrics.top_tags?.[0]?.tag || 'general inquiries';
        const gapList = metrics.knowledge_gaps?.map((g) => g.tag).join(', ') || 'none';
        return `During this reporting period, the team handled ${metrics.total_tickets} tickets with an auto-resolution rate of ${metrics.auto_resolved_pct}% and average confidence of ${metrics.avg_confidence}. The most common driver was '${topTag}'.\n\nThe primary knowledge gaps identified were '${gapList}'. Updating support documentation for these topics will directly reduce human escalations.`;
    },
};
