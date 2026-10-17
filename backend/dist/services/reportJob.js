"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateWeeklyReport = generateWeeklyReport;
exports.initReportJob = initReportJob;
const node_cron_1 = __importDefault(require("node-cron"));
const database_1 = require("../db/database");
const aiClient_1 = require("./aiClient");
/**
 * Generate weekly support analytics report for the last 7 days compared to the prior 7 days
 */
async function generateWeeklyReport() {
    const now = new Date();
    const currentWeekEnd = now.toISOString();
    const currentWeekStartDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const currentWeekStart = currentWeekStartDate.toISOString();
    const prevWeekStartDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const prevWeekStart = prevWeekStartDate.toISOString();
    // Fetch tickets for both windows
    const currentTickets = database_1.dbOperations.getTicketsBetween(currentWeekStart, currentWeekEnd);
    const prevTickets = database_1.dbOperations.getTicketsBetween(prevWeekStart, currentWeekStart);
    const totalTickets = currentTickets.length;
    let autoResolvedCount = 0;
    let escalatedCount = 0;
    let confidenceSum = 0;
    let confidenceCount = 0;
    // Tag frequency maps
    const currentTagCounts = {};
    const currentTagEscalated = {};
    const prevTagCounts = {};
    for (const t of currentTickets) {
        if (t.status === 'auto_resolved') {
            autoResolvedCount++;
        }
        else {
            // 'escalated' or 'human_resolved'
            escalatedCount++;
        }
        if (typeof t.confidence === 'number') {
            confidenceSum += t.confidence;
            confidenceCount++;
        }
        const tags = t.tags || [];
        for (const tag of tags) {
            currentTagCounts[tag] = (currentTagCounts[tag] || 0) + 1;
            if (t.status !== 'auto_resolved') {
                currentTagEscalated[tag] = (currentTagEscalated[tag] || 0) + 1;
            }
        }
    }
    for (const t of prevTickets) {
        const tags = t.tags || [];
        for (const tag of tags) {
            prevTagCounts[tag] = (prevTagCounts[tag] || 0) + 1;
        }
    }
    const autoResolvedPct = totalTickets > 0 ? Math.round((autoResolvedCount / totalTickets) * 1000) / 10 : 0;
    const escalatedPct = totalTickets > 0 ? Math.round((escalatedCount / totalTickets) * 1000) / 10 : 0;
    const avgConfidence = confidenceCount > 0 ? Math.round((confidenceSum / confidenceCount) * 100) / 100 : 0;
    // Top 5 tags by current volume with week-over-week delta
    const topTags = Object.entries(currentTagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([tag, count]) => {
        const prevCount = prevTagCounts[tag] || 0;
        let changePct = 0;
        if (prevCount > 0) {
            changePct = Math.round(((count - prevCount) / prevCount) * 100);
        }
        else if (count > 0) {
            changePct = 100;
        }
        return {
            tag,
            count,
            prev_count: prevCount,
            change_pct: changePct,
        };
    });
    // Top knowledge gaps: tags that trigger human escalations most frequently
    const knowledgeGaps = Object.entries(currentTagEscalated)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([tag, escCount]) => {
        const totalForTag = currentTagCounts[tag] || escCount;
        const rate = totalForTag > 0 ? Math.round((escCount / totalForTag) * 1000) / 10 : 0;
        return {
            tag,
            escalated_count: escCount,
            total_tag_tickets: totalForTag,
            escalation_rate_pct: rate,
        };
    });
    // Call Python service /insights for plain-English analysis
    const insightPayload = {
        total_tickets: totalTickets,
        auto_resolved_pct: autoResolvedPct,
        escalated_pct: escalatedPct,
        top_tags: topTags,
        knowledge_gaps: knowledgeGaps,
        avg_confidence: avgConfidence,
    };
    const insight = await aiClient_1.aiClient.getInsights(insightPayload);
    const reportData = {
        total_tickets: totalTickets,
        auto_resolved_count: autoResolvedCount,
        auto_resolved_pct: autoResolvedPct,
        escalated_count: escalatedCount,
        escalated_pct: escalatedPct,
        avg_confidence: avgConfidence,
        top_tags: topTags,
        knowledge_gaps: knowledgeGaps,
        insight: insight,
    };
    // Save in SQLite reports table
    const reportId = database_1.dbOperations.saveReport(currentWeekStart, currentWeekEnd, reportData);
    return {
        id: reportId,
        week_start: currentWeekStart,
        week_end: currentWeekEnd,
        created_at: new Date().toISOString(),
        ...reportData,
    };
}
/**
 * Initialize node-cron scheduled job:
 * Runs every Monday at 9:00 AM ('0 9 * * 1')
 */
function initReportJob() {
    node_cron_1.default.schedule('0 9 * * 1', async () => {
        console.log('[node-cron] Running scheduled weekly support report generation...');
        try {
            const report = await generateWeeklyReport();
            console.log('[node-cron] Weekly report generated successfully with id:', report.id);
        }
        catch (err) {
            console.error('[node-cron] Scheduled weekly report failed:', err);
        }
    });
    console.log('[node-cron] Weekly report schedule initialized (Every Monday at 9:00 AM)');
}
