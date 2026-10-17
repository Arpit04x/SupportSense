"use strict";
/**
 * Backend Verification and Unit Test Script.
 * Runs tests against SQLite database methods, schema, and ticket lifecycle.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const database_js_1 = require("./db/database.js");
async function runTests() {
    console.log('Starting Backend Unit Tests...');
    // Test 1: Tables exist
    console.log('  [Test 1] Verifying database schema...');
    const tables = database_js_1.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const tableNames = tables.map(t => t.name);
    (0, assert_1.default)(tableNames.includes('tickets'), "Table 'tickets' should exist");
    (0, assert_1.default)(tableNames.includes('reports'), "Table 'reports' should exist");
    (0, assert_1.default)(tableNames.includes('feedback_pairs'), "Table 'feedback_pairs' should exist");
    console.log('  ✓ Database schema verified (tickets, reports, feedback_pairs exist).');
    // Test 2: Ticket creation and AI update
    console.log('  [Test 2] Creating initial ticket...');
    const ticketId = database_js_1.dbOperations.createInitialTicket('tester@example.com', 'What is the return window?');
    (0, assert_1.default)(ticketId > 0, 'Ticket ID should be a positive number');
    console.log(`  ✓ Created ticket #${ticketId}`);
    console.log('  [Test 3] Updating ticket with AI auto-resolution...');
    const updated = database_js_1.dbOperations.updateTicketWithAiResult({
        id: ticketId,
        status: 'auto_resolved',
        ai_answer: 'You have 30 days to return eligible products.',
        confidence: 0.85,
        sources: ['returns_and_refunds.md'],
        summary: null,
        tags: ['refund'],
        urgency: 'low',
    });
    (0, assert_1.default)(updated !== null, 'Updated ticket should not be null');
    assert_1.default.strictEqual(updated.status, 'auto_resolved');
    assert_1.default.strictEqual(updated.confidence, 0.85);
    assert_1.default.deepStrictEqual(updated.sources, ['returns_and_refunds.md']);
    assert_1.default.deepStrictEqual(updated.tags, ['refund']);
    console.log('  ✓ AI auto-resolution update verified.');
    // Test 4: Escalation and Human Resolution with Feedback Pair
    console.log('  [Test 4] Testing escalation and human resolution...');
    const escId = database_js_1.dbOperations.createInitialTicket('esc@example.com', 'Can you deliver pizza to my home?');
    database_js_1.dbOperations.updateTicketWithAiResult({
        id: escId,
        status: 'escalated',
        ai_answer: 'INSUFFICIENT_INFO',
        confidence: 0.0,
        sources: [],
        summary: '1. Customer Wants: Pizza delivery\n2. AI Attempted: Not covered\n3. Next Step: Inform customer',
        tags: ['other'],
        urgency: 'low',
    });
    const humanReply = 'ShopEasy is an e-commerce retailer and does not provide hot food delivery.';
    const resolved = database_js_1.dbOperations.resolveTicketWithHumanReply(escId, humanReply);
    (0, assert_1.default)(resolved !== null, 'Resolved ticket should not be null');
    assert_1.default.strictEqual(resolved.status, 'human_resolved');
    assert_1.default.strictEqual(resolved.human_reply, humanReply);
    // Verify feedback pair was created
    const fbStmt = database_js_1.db.prepare('SELECT * FROM feedback_pairs WHERE ticket_id = ?');
    const fbRow = fbStmt.get(escId);
    (0, assert_1.default)(fbRow !== undefined, 'A feedback pair record must be created');
    assert_1.default.strictEqual(fbRow.human_reply, humanReply);
    console.log('  ✓ Human resolution and feedback_pair generation verified.');
    // Test 5: Reports saving and retrieval
    console.log('  [Test 5] Testing weekly reports persistence...');
    const reportPayload = {
        total_tickets: 15,
        auto_resolved: 10,
        escalated: 5,
        top_tags: [{ tag: 'refund', count: 7 }],
        knowledge_gaps: [{ topic: 'Delivery', count: 2 }],
    };
    const reportId = database_js_1.dbOperations.saveReport('2026-10-01', '2026-10-07', reportPayload);
    (0, assert_1.default)(reportId > 0, 'Report ID should be a positive number');
    const latest = database_js_1.dbOperations.getLatestReport();
    (0, assert_1.default)(latest !== null, 'Latest report should not be null');
    assert_1.default.strictEqual(latest.total_tickets, 15);
    console.log('  ✓ Weekly report persistence verified.');
    console.log('\n==========================================');
    console.log('ALL BACKEND UNIT TESTS PASSED SUCCESSFULLY');
    console.log('==========================================');
}
runTests().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
});
